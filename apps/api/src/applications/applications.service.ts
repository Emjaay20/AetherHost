import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { assertWorkloadSpec } from './workload-spec';
import { randomUUID } from 'crypto';
import {
  Application,
  Runtime,
  ApplicationProvisioningRequested,
} from '@aetherhost/domain';
import { slugify } from '@aetherhost/common';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { DomainEventsService } from '../events/domain-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_TENANT_ID } from '../auth/tenant.decorator';
import { getGithubToken } from './github-utils';

export type ApplicationWithToken = Application & { githubToken: string | null };

@Injectable()
export class ApplicationsService {
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
    withRedis?: boolean,
    port?: number,
    healthPath?: string,
  ): Promise<Application> {
    assertWorkloadSpec({
      runtime,
      dockerImage,
      envVars,
      workerCommand,
      withPostgres,
      withRedis,
      port,
      healthPath,
    });
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (tenant?.subscriptionStatus === 'suspended') {
        throw new ForbiddenException('Tenant account is suspended');
      }

      const slotConsumed =
        await this.entitlementsService.consumeApplicationSlot(tenantId, tx);
      if (!slotConsumed) {
        throw new ForbiddenException('Application limit reached');
      }

      let generatedAiFiles = aiFiles;
      if (!generatedAiFiles && !githubRepo && runtime !== 'wordpress') {
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
            }
          } catch (e) {
             console.error("Failed to auto-create repo", e);
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
          customDomain,
          dockerCompose,
          aiFiles: generatedAiFiles ? JSON.parse(JSON.stringify(generatedAiFiles)) : null,
          dockerImage: dockerImage?.trim() || null,
          envVars: envVars ? JSON.parse(JSON.stringify(envVars)) : null,
          workerCommand: workerCommand?.trim() || null,
          withPostgres,
          withRedis,
          port,
          healthPath,
        },
      });

      await this.eventsService.publish(
        new ApplicationProvisioningRequested(tenantId, newApp.id),
        tx,
      );

      return newApp as unknown as Application;
    });
  }

  async findAll(
    status?: string,
    runtime?: string,
    tenantId?: string,
  ): Promise<Application[]> {
    const where: Record<string, string> = {};
    if (status) where.status = status;
    if (runtime) where.runtime = runtime;
    if (tenantId && tenantId !== SYSTEM_TENANT_ID) where.tenantId = tenantId;

    const apps = await this.prisma.application.findMany({ where }) as unknown as Application[];

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

  async updateCustomDomain(id: string, tenantId: string, customDomain: string | null): Promise<void> {
    await this.assertOwned(id, tenantId);
    
    // In a real app, verify the customDomain is unique and valid
    await this.prisma.application.update({
      where: { id },
      data: { customDomain },
    });
    
    // Trigger reprovision so agent picks up new domain
    await this.eventsService.publish(
      new ApplicationProvisioningRequested(tenantId, id),
      this.prisma,
    );
  }

  async addLog(id: string, logContent: string): Promise<void> {
    await this.prisma.deploymentLog.create({
      data: { applicationId: id, logContent }
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.assertOwned(id, tenantId);
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

    return updated;
  }

  async getLogs(id: string, tenantId: string) {
    await this.assertOwned(id, tenantId);
    return this.prisma.deploymentLog.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
  }

  private async assertOwned(id: string, tenantId: string) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (tenantId !== SYSTEM_TENANT_ID && app.tenantId !== tenantId) {
      throw new ForbiddenException(
        'Application does not belong to this tenant',
      );
    }
    return app;
  }
}
