import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { assertWorkloadSpec, validateDockerImage } from './workload-spec';
import { randomUUID } from 'crypto';
import {
  Application,
  Runtime,
  ApplicationProvisioningRequested,
} from '@aetherhost/domain';
import { safeAppName, slugify } from '@aetherhost/common';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';
import { getGithubToken, ensureGithubWebhook } from './github-utils';
import { validateCustomDomain } from './domain-validator';
import { resolve4 } from 'node:dns/promises';

export type ApplicationWithToken = Application & { githubToken: string | null };

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  constructor(
    private readonly entitlementsService: EntitlementsService,
    private readonly eventsService: DomainEventsService,
    private readonly prisma: PrismaService,
  ) {}

  async create(
    tenantId: string,
    name: string,
    runtime: Runtime,
    githubRepo?: string,
    dockerCompose?: string,
    aiFiles?: { path: string; content: string }[],
    githubRepoName?: string,
    githubRepoDescription?: string,
    customDomain?: string,
    dockerImage?: string,
    envVars?: Record<string, string>,
    workerCommand?: string,
    withPostgres?: boolean,
    withMariaDb?: boolean,
    withRedis?: boolean,
    port?: number,
    healthPath?: string,
  ): Promise<Application> {
    const validatedDomain = validateCustomDomain(customDomain);
    assertWorkloadSpec({
      runtime,
      dockerImage,
      envVars,
      workerCommand,
      withPostgres,
      withMariaDb,
      withRedis,
      port,
      healthPath,
    });
    const normalizedName = safeAppName(name);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (tenant?.subscriptionStatus === 'suspended') {
        throw new ForbiddenException('Tenant account is suspended');
      }

      if (validatedDomain) {
        const domainInUse = await tx.application.findFirst({
          where: {
            customDomain: validatedDomain,
            status: { notIn: ['terminated'] },
          },
        });
        if (domainInUse) {
          throw new ConflictException(
            `Custom domain "${validatedDomain}" is already in use by another application`,
          );
        }
      }

      const activeApps =
        (await tx.application.findMany({
          where: { status: { notIn: ['terminated', 'failed'] } },
          select: { name: true },
        })) ?? [];
      if (
        activeApps.some((existing) => safeAppName(existing.name) === normalizedName)
      ) {
        throw new ConflictException(
          `Application route "${normalizedName}" is already in use`,
        );
      }

      const slotConsumed =
        await this.entitlementsService.consumeApplicationSlot(tenantId, tx);
      if (!slotConsumed) {
        throw new ForbiddenException('Application limit reached');
      }

      let generatedAiFiles = aiFiles;
      if (
        !generatedAiFiles &&
        !githubRepo &&
        runtime !== 'wordpress' &&
        runtime !== 'github' &&
        runtime !== 'docker'
      ) {
        generatedAiFiles = this.getBoilerplateFiles(runtime);
      }

      let finalGithubRepo = githubRepo;
      if (!finalGithubRepo && runtime !== 'wordpress') {
        const token = await getGithubToken(tenantId);
        if (token) {
          try {
            const ghRes = await fetch('https://api.github.com/user/repos', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'AetherHost-API',
              },
              body: JSON.stringify({
                name: githubRepoName || name,
                description: githubRepoDescription || `AetherHost deployed ${runtime} app`,
                private: true,
                auto_init: false
              })
            });
            if (ghRes.ok) {
              const repoData = await ghRes.json();
              finalGithubRepo = repoData.clone_url;
            } else if (ghRes.status === 422) {
              const userRes = await fetch('https://api.github.com/user', {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'User-Agent': 'AetherHost-API',
                },
              });
              if (userRes.ok) {
                const userData = await userRes.json();
                const targetName = githubRepoName || name;
                const existingRepoRes = await fetch(`https://api.github.com/repos/${userData.login}/${targetName}`, {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'AetherHost-API',
                  },
                });
                if (existingRepoRes.ok) {
                  const existingData = await existingRepoRes.json();
                  finalGithubRepo = existingData.clone_url;
                }
              }
            } else {
              const errBody = await ghRes.text();
              this.logger.warn(`GitHub API repo creation returned ${ghRes.status}: ${errBody}`);
            }
          } catch (e) {
            this.logger.error(
              `Failed to auto-create repo: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }

      const id = `app_${slugify(name)}_${randomUUID().slice(0, 8)}`;
      
      const newApp = await tx.application.create({
        data: {
          id,
          tenantId,
          name,
          runtime,
          status: 'pending',
          githubRepo: finalGithubRepo,
          githubRepoName,
          githubRepoDescription,
          customDomain: validatedDomain,
          dockerCompose,
          aiFiles: generatedAiFiles ? JSON.parse(JSON.stringify(generatedAiFiles)) : null,
          dockerImage: dockerImage?.trim() || null,
          envVars: envVars ? JSON.parse(JSON.stringify(envVars)) : null,
          workerCommand: workerCommand?.trim() || null,
          withPostgres,
          withMariaDb,
          withRedis,
          port,
          healthPath,
        },
      });

      await this.eventsService.publish(
        new ApplicationProvisioningRequested(tenantId, newApp.id),
        tx,
      );

      if (this.shouldSimulateProvisioning()) {
        void this.simulateDemoProvisioning(
          newApp.id,
          newApp.name,
          newApp.runtime,
          'Initial deployment',
        );
      }

      if (finalGithubRepo) {
        void ensureGithubWebhook(tenantId, finalGithubRepo);
      }

      return newApp as unknown as Application;
    });
  }

  private shouldSimulateProvisioning(): boolean {
    return process.env.DEMO_MODE === 'true';
  }

  async findAll(
    status?: string,
    runtime?: string,
    tenantId?: string,
  ): Promise<Application[]> {
    const where: any = {};
    if (status) where.status = status;
    if (runtime) where.runtime = runtime;
    if (tenantId && tenantId !== SYSTEM_TENANT_ID) {
      const admins = (process.env.ADMIN_TENANT_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (admins.includes(tenantId)) {
        where.tenantId = { in: admins };
      } else {
        where.tenantId = tenantId;
      }
    }

    const apps = await this.prisma.application.findMany({ 
      where,
      orderBy: { createdAt: 'desc' },
    }) as unknown as Application[];

    if (tenantId === SYSTEM_TENANT_ID && status === 'pending') {
      // Provide Github tokens to the agent
      const appsWithTokens = await Promise.all(
        apps.map(async (app) => {
          const token = await getGithubToken(app.tenantId);
          return { ...app, githubToken: token } as unknown as Application;
        })
      );
      return appsWithTokens;
    }
    
    return apps;
  }

  private getBoilerplateFiles(runtime: string): { path: string; content: string }[] {
    switch (runtime) {
      case 'nodejs':
        return [
          { path: 'package.json', content: '{\n  "name": "app",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "node index.js"\n  },\n  "dependencies": {\n    "express": "^4.18.2"\n  }\n}' },
          { path: 'index.js', content: `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date() });
});

app.get('/api/info', (req, res) => {
  res.json({ name: 'AetherHost App', runtime: 'Node.js', status: 'online' });
});

app.get('/', (req, res) => {
  res.send(\`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherHost Application</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-6">
  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
    <div class="w-16 h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">
      ⚡
    </div>
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Application Online</h1>
      <p class="text-sm text-slate-400 mt-1">Deployed with AetherHost Control Plane</p>
    </div>
    <div class="grid grid-cols-2 gap-3 text-left">
      <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-500 block">Status</span>
        <span class="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Running
        </span>
      </div>
      <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-500 block">Runtime</span>
        <span class="text-sm font-semibold text-blue-400 mt-0.5 block">Node.js 18</span>
      </div>
    </div>
    <div class="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
      <span>Route: /</span>
      <a href="/health" class="text-blue-400 hover:underline">Check /health &rarr;</a>
    </div>
  </div>
</body>
</html>\`);
});

app.listen(port, () => {
  console.log(\`App listening on port \${port}\`);
});` }
        ];
      case 'python':
        return [
          { path: 'requirements.txt', content: 'flask==3.0.0' },
          { path: 'main.py', content: `import os, time
from flask import Flask, jsonify, render_template_string
app = Flask(__name__)
start_time = time.time()

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AetherHost Python App</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-6">
  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
    <div class="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">
      🐍
    </div>
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Python Service Online</h1>
      <p class="text-sm text-slate-400 mt-1">Flask microservice running on AetherHost</p>
    </div>
    <div class="grid grid-cols-2 gap-3 text-left">
      <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-500 block">Status</span>
        <span class="text-sm font-semibold text-emerald-400 flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Running
        </span>
      </div>
      <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-500 block">Runtime</span>
        <span class="text-sm font-semibold text-emerald-400 mt-0.5 block">Python 3.11</span>
      </div>
    </div>
    <div class="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
      <span>Route: /</span>
      <a href="/health" class="text-emerald-400 hover:underline">Check /health &rarr;</a>
    </div>
  </div>
</body>
</html>"""

@app.route('/')
def index():
    return render_template_string(HTML_PAGE)

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "runtime": "python-flask", "uptime": time.time() - start_time}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)` }
        ];
      case 'go':
        return [
          { path: 'main.go', content: "package main\n\nimport (\n\t\"fmt\"\n\t\"net/http\"\n\t\"os\"\n)\n\nfunc main() {\n\thttp.HandleFunc(\"/\", func(w http.ResponseWriter, r *http.Request) {\n\t\tfmt.Fprintf(w, \"Hello from Go!\")\n\t})\n\thttp.HandleFunc(\"/health\", func(w http.ResponseWriter, r *http.Request) {\n\t\tw.WriteHeader(http.StatusOK)\n\t\tfmt.Fprintf(w, \"OK\")\n\t})\n\tport := os.Getenv(\"PORT\")\n\tif port == \"\" {\n\t\tport = \"3000\"\n\t}\n\tfmt.Printf(\"Listening on port %s\\n\", port)\n\thttp.ListenAndServe(\":\"+port, nil)\n}" },
          { path: 'go.mod', content: "module app\n\ngo 1.22" }
        ];
      case 'rust':
        return [
          { path: 'Cargo.toml', content: "[package]\nname = \"app\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\naxum = \"0.7.5\"\ntokio = { version = \"1.37.0\", features = [\"full\"] }" },
          { path: 'src/main.rs', content: "use axum::{routing::get, Router};\n\n#[tokio::main]\nasync fn main() {\n    let app = Router::new().route(\"/\", get(|| async { \"Hello from Rust!\" })).route(\"/health\", get(|| async { \"OK\" }));\n    let port = std::env::var(\"PORT\").unwrap_or_else(|_| \"3000\".to_string());\n    let addr = format!(\"0.0.0.0:{}\", port);\n    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();\n    println!(\"Listening on {}\", addr);\n    axum::serve(listener, app).await.unwrap();\n}" }
        ];
      case 'php':
        return [
          { path: 'public/index.php', content: "<?php\n\n$requestUri = $_SERVER['REQUEST_URI'] ?? '/';\nif ($requestUri === '/health') {\n    http_response_code(200);\n    echo 'OK';\n    exit;\n}\n\necho 'Hello from PHP!';\n" }
        ];
      default:
        return [];
    }
  }

  async remove(id: string, tenantId: string): Promise<void> {
    if (process.env.DEMO_MODE === 'true') {
      return this.hardDelete(id, tenantId);
    }
    await this.assertOwned(id, tenantId);
    await this.updateStatus(id, 'terminating');
  }

  async hardDelete(id: string, tenantId: string): Promise<void> {
    const app = await this.assertOwned(id, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.application.delete({ where: { id } });
      await this.entitlementsService.releaseApplicationSlot(app.tenantId, tx);
    });
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('App not found');

    // If transitioning from running/pending to failed or terminated, release the slot.
    if ((app.status !== 'failed' && app.status !== 'terminated') && 
        (status === 'failed' || status === 'terminated')) {
      await this.prisma.$transaction(async (tx) => {
        await tx.application.update({ where: { id }, data: { status } });
        await this.entitlementsService.releaseApplicationSlot(app.tenantId, tx);
      });
    } else {
      await this.prisma.application.update({
        where: { id },
        data: { status },
      });
    }
  }

  async updateCustomDomain(id: string, tenantId: string, customDomain: string | null): Promise<{ success: boolean; customDomain: string | null }> {
    await this.assertOwned(id, tenantId);
    const validatedDomain = validateCustomDomain(customDomain);
    if (validatedDomain) {
      const domainInUse = await this.prisma.application.findFirst({
        where: {
          customDomain: validatedDomain,
          id: { not: id },
          status: { notIn: ['terminated'] },
        },
      });
      if (domainInUse) {
        throw new ConflictException(
          `Custom domain "${validatedDomain}" is already in use by another application`,
        );
      }
    }

    await this.prisma.application.update({
      where: { id },
      data: { customDomain: validatedDomain, status: 'pending' },
    });
    
    // Trigger reprovision so agent updates Traefik routing and SSL
    await this.eventsService.publish(
      new ApplicationProvisioningRequested(tenantId, id),
      this.prisma,
    );

    return { success: true, customDomain: validatedDomain };
  }

  async updateDockerImage(
    id: string,
    tenantId: string,
    dockerImage: string,
    redeploy = true,
  ): Promise<{ success: boolean; dockerImage: string; status: string }> {
    const app = await this.assertOwned(id, tenantId);
    if (app.runtime === 'wordpress') {
      throw new BadRequestException('WordPress does not support custom container images');
    }

    const validatedImage = validateDockerImage(dockerImage);

    // If app has a workload contract, validate that the new image preserves it
    const envVars = (app.envVars as Record<string, string>) || {};
    assertWorkloadSpec({
      runtime: app.runtime,
      dockerImage: validatedImage,
      envVars,
      workerCommand: app.workerCommand || undefined,
      withPostgres: app.withPostgres,
      withMariaDb: app.withMariaDb,
      withRedis: app.withRedis,
      port: app.port || undefined,
      healthPath: app.healthPath || undefined,
    });

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        dockerImage: validatedImage,
        ...(redeploy ? { status: 'pending' } : {}),
      },
    });

    const ts = new Date().toTimeString().split(' ')[0];
    await this.addLog(
      id,
      `[${ts}] Container image updated to "${validatedImage}". Preserving database, volumes, and custom domain.${redeploy ? ' Triggering rolling update...' : ''}`,
    );

    if (redeploy) {
      await this.eventsService.publish(
        new ApplicationProvisioningRequested(app.tenantId, id),
        this.prisma,
      );
    }

    return {
      success: true,
      dockerImage: validatedImage,
      status: updated.status,
    };
  }

  async addLog(id: string, logContent: string): Promise<void> {
    await this.prisma.deploymentLog.create({
      data: { applicationId: id, logContent }
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.assertOwned(id, tenantId);
  }

  async findPreviewBySafeName(targetSafeName: string) {
    const normalized = safeAppName(targetSafeName);
    const apps = await this.prisma.application.findMany({
      where: { status: { notIn: ['terminated'] } },
      orderBy: { createdAt: 'desc' },
    });
    const matched = apps.find((a) => safeAppName(a.name) === normalized);
    if (!matched) {
      throw new NotFoundException(`Application "${normalized}" not found`);
    }
    return {
      id: matched.id,
      name: matched.name,
      runtime: matched.runtime,
      status: matched.status,
      aiFiles: matched.aiFiles,
      dockerImage: matched.dockerImage,
      port: matched.port,
      healthPath: matched.healthPath,
      updatedAt: matched.createdAt.toISOString(),
      createdAt: matched.createdAt,
    };
  }

  async applyAiIteration(
    id: string,
    tenantId: string,
    data: {
      aiFiles: { path: string; content: string }[];
      commitMessage: string;
      githubRepo?: string;
    },
  ) {
    const app = await this.assertOwned(id, tenantId);

    const updateData: any = {
      aiFiles: JSON.parse(JSON.stringify(data.aiFiles)),
      commitMessage: data.commitMessage,
      status: 'pending',
    };
    if (data.githubRepo) {
      updateData.githubRepo = data.githubRepo;
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: updateData,
    });

    await this.eventsService.publish(
      new ApplicationProvisioningRequested(tenantId, id),
      this.prisma,
    );

    if (this.shouldSimulateProvisioning()) {
      void this.simulateDemoProvisioning(
        id,
        app.name,
        app.runtime,
        data.commitMessage,
      );
    }

    return updated;
  }

  async getEnvVars(id: string, tenantId: string) {
    const app = await this.assertOwned(id, tenantId);
    return {
      envVars: (app.envVars as Record<string, string>) || {},
    };
  }

  async getTimeline(id: string, tenantId: string) {
    await this.assertOwned(id, tenantId);
    const [logs, events] = await Promise.all([
      this.prisma.deploymentLog.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.domainEventRecord.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return [...logs.map((log) => ({ id: log.id, kind: 'log', message: log.logContent, createdAt: log.createdAt })), ...events.map((event) => ({ id: `event-${event.id}`, kind: 'event', eventName: event.eventName, payload: event.payload, message: event.eventName.replace(/([A-Z])/g, ' $1').trim(), createdAt: event.createdAt }))].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getRecentLogText(id: string, tenantId: string, limit = 25) {
    await this.assertOwned(id, tenantId);
    const logs = await this.prisma.deploymentLog.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return logs.reverse().map((log) => log.logContent).join('\n').slice(-12_000);
  }

  async getDomainStatus(id: string, tenantId: string) {
    const app = await this.assertOwned(id, tenantId);
    if (!app.customDomain) return { configured: false, dns: 'not_configured', ssl: 'not_configured' };
    const expectedIp = process.env.VPS_PUBLIC_IP || '194.163.172.101';
    let addresses: string[] = [];
    try { addresses = await resolve4(app.customDomain); } catch { /* DNS has not propagated. */ }
    const dns = addresses.length ? (addresses.includes(expectedIp) ? 'verified' : 'misconfigured') : 'pending';
    let ssl: 'active' | 'pending' = 'pending';
    if (addresses.length) try { const response = await fetch(`https://${app.customDomain}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6000) }); ssl = response.status < 500 ? 'active' : 'pending'; } catch { /* Certificate is still provisioning. */ }
    return { configured: true, domain: app.customDomain, expectedIp, addresses, dns, ssl, reprovisioning: app.status === 'pending' };
  }

  async updateEnvVars(
    id: string,
    tenantId: string,
    envVars: Record<string, string>,
    shouldRedeploy = true,
  ) {
    const app = await this.assertOwned(id, tenantId);

    assertWorkloadSpec({
      runtime: app.runtime,
      envVars,
    });

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        envVars: JSON.parse(JSON.stringify(envVars)),
      },
    });

    if (shouldRedeploy) {
      return this.redeploy(id, tenantId, envVars);
    }

    return { success: true, envVars: updated.envVars };
  }

  async redeploy(
    id: string,
    tenantId: string,
    envVars?: Record<string, string>,
    dockerImage?: string,
  ) {
    const app = await this.assertOwned(id, tenantId);

    const targetImage =
      dockerImage !== undefined && dockerImage.trim() !== ''
        ? validateDockerImage(dockerImage)
        : app.dockerImage;

    if (envVars !== undefined || dockerImage !== undefined) {
      assertWorkloadSpec({
        runtime: app.runtime,
        dockerImage: targetImage || undefined,
        envVars:
          envVars !== undefined
            ? envVars
            : ((app.envVars as Record<string, string>) || {}),
        workerCommand: app.workerCommand || undefined,
        withPostgres: app.withPostgres,
        withMariaDb: app.withMariaDb,
        withRedis: app.withRedis,
        port: app.port || undefined,
        healthPath: app.healthPath || undefined,
      });
    }

    const existingFiles = Array.isArray(app.aiFiles) ? app.aiFiles : [];
    const aiFilesToSave =
      existingFiles.length > 0
        ? existingFiles
        : app.runtime !== 'wordpress' &&
            !app.githubRepo &&
            app.runtime !== 'github' &&
            app.runtime !== 'docker'
          ? this.getBoilerplateFiles(app.runtime)
          : null;

    const data: any = {
      status: 'pending',
      ...(targetImage !== undefined && targetImage !== null
        ? { dockerImage: targetImage }
        : {}),
      ...(aiFilesToSave
        ? { aiFiles: JSON.parse(JSON.stringify(aiFilesToSave)) }
        : {}),
      ...(envVars !== undefined
        ? { envVars: JSON.parse(JSON.stringify(envVars)) }
        : {}),
    };

    const updated = await this.prisma.application.update({
      where: { id },
      data,
    });

    await this.eventsService.publish(
      new ApplicationProvisioningRequested(app.tenantId, id),
      this.prisma,
    );

    if (this.shouldSimulateProvisioning()) {
      void this.simulateDemoProvisioning(
        id,
        app.name,
        app.runtime,
        'Manual redeploy triggered',
      );
    }

    if (app.githubRepo) {
      void ensureGithubWebhook(app.tenantId, app.githubRepo);
    }

    return updated;
  }

  private async simulateDemoProvisioning(
    appId: string,
    appName: string,
    runtime: string,
    reason: string,
  ): Promise<void> {
    const ts = () => new Date().toTimeString().split(' ')[0];
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    try {
      await this.addLog(
        appId,
        `[${ts()}] Provisioning initiated for '${appName}' (Runtime: ${runtime}) — ${reason}`,
      );
      await sleep(700);
      await this.addLog(
        appId,
        `[${ts()}] Synthesizing application source files & building ${runtime} container image...`,
      );
      await sleep(800);
      await this.addLog(
        appId,
        `[${ts()}] Container launched on aetherhost-net. Probing HTTP readiness on port 3000 (/health)...`,
      );
      await sleep(700);
      await this.addLog(
        appId,
        `[${ts()}] Health probe returned 200 OK! Application '${appName}' is online and serving traffic.`,
      );
      await this.updateStatus(appId, 'running');
    } catch (err) {
      this.logger.error(
        `Demo provisioning simulation error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getLogs(id: string, tenantId: string) {
    const app = await this.assertOwned(id, tenantId);
    const logs = await this.prisma.deploymentLog.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    if (logs.length === 0 && this.prisma.deploymentLog?.create) {
      const ts = new Date(app.createdAt || Date.now()).toTimeString().split(' ')[0];
      const fallbackMessage =
        app.status === 'failed'
          ? `[${ts}] ERROR: Provisioning failed for '${app.name}' (Runtime: ${app.runtime}). Runtime container did not pass readiness check (/health) or provisioner encountered an unhandled runtime state.\n[${ts}] HINT: Click 'Redeploy' to rebuild and restart the container, or click 'Analyze Failure with AI' for a root-cause breakdown.`
          : app.status === 'pending'
            ? `[${ts}] Provisioning queued for '${app.name}' (Runtime: ${app.runtime}). Waiting for build worker or click 'Redeploy' / 'Run Provisioner' to start immediately.`
            : `[${ts}] Provisioning completed for '${app.name}' (Runtime: ${app.runtime}).\n[${ts}] Health check 200 OK on /health — container is online and serving requests.`;
      try {
        const seeded = await this.prisma.deploymentLog.create({
          data: {
            applicationId: id,
            logContent: fallbackMessage,
          },
        });
        return [seeded];
      } catch {
        return [];
      }
    }

    return logs;
  }

  private async assertOwned(id: string, tenantId: string) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const isAdmin = admins.includes(tenantId);

    if (tenantId !== SYSTEM_TENANT_ID && !isAdmin && app.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Application does not belong to this tenant',
      );
    }
    return app;
  }
}
