import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProxyService } from './ai-proxy.service';

@Injectable()
export class OpsInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProxy: AiProxyService,
  ) {}

  async generate(
    tenantId: string,
    options?: { applicationId?: string; customPrompt?: string },
  ) {
    const admins = (process.env.ADMIN_TENANT_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const isAdmin = admins.includes(tenantId);
    const tenantWhere = isAdmin ? { in: admins } : tenantId;

    const applicationId = options?.applicationId?.trim();
    const customPrompt = options?.customPrompt?.trim();

    if (applicationId) {
      const app = await this.prisma.application.findFirst({
        where: { id: applicationId, tenantId: tenantWhere },
      });
      if (!app) throw new ForbiddenException('Application does not belong to this tenant');

      const logs = await this.prisma.deploymentLog.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });

      const events = await this.prisma.domainEventRecord.findMany({
        where: { applicationId },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });

      const aiFiles = Array.isArray(app?.aiFiles)
        ? (app.aiFiles as { path: string; content: string }[])
        : [];

      const projectSnapshot = {
        app: app
          ? {
              id: app.id,
              name: app.name,
              runtime: app.runtime,
              status: app.status,
              githubRepo: app.githubRepo,
              commitMessage: app.commitMessage,
              port: app.port,
              healthPath: app.healthPath,
              files: aiFiles.map((f) => ({
                path: f.path,
                preview: f.content.slice(0, 400),
              })),
            }
          : { id: applicationId },
        recentLogs: logs.map((l) => l.logContent).reverse(),
        recentEvents: events.map((e) => ({
          name: e.eventName,
          createdAt: e.createdAt,
          payload: e.payload,
        })),
      };

      const prompt = customPrompt
        ? `You are an expert Site Reliability Engineer for AetherHost PaaS.
Analyze this specific application failure/deployment state and provide a concise, actionable root-cause diagnosis.
Keep your entire response under 180 words. Do NOT generate long bash scripts or giant tables.
Use these exact markdown headings:
## Root Cause Diagnosis
## Configuration & Log Signals
## Recommended Fix

User Context:
${customPrompt}

Application Snapshot:
${JSON.stringify(projectSnapshot)}`
        : `You are an expert Site Reliability Engineer for AetherHost PaaS.
Provide a concise, structured operational insight for the project "${app?.name || applicationId}" (${app?.runtime || 'unknown'} runtime, current status: ${app?.status || 'unknown'}).
Keep your entire response strictly under 220 words. Do NOT output long bash scripts or multi-page tables.
Structure your response using ONLY these exact ## markdown headings so the UI can render them as collapsible sections:
## Project Health & Status
(2-3 concise bullet points on current status, runtime configuration, and readiness)
## Build & Runtime Logs Analysis
(2-3 concise bullet points summarizing recent container logs, commits, and domain events)
## Recommended Actions
(2-3 concrete, immediate steps the developer can take right now in AetherHost, e.g. Redeploy, AI Architect prompt, or health check adjustment)

Project Snapshot:
${JSON.stringify(projectSnapshot)}`;

      const completion = await this.aiProxy.complete(
        tenantId,
        prompt,
        'ops_insight',
        applicationId,
      );

      return {
        tenantId,
        applicationId,
        applicationName: app?.name || applicationId,
        insight: completion.output,
        output: completion.output,
        model: completion.model,
        costUsd: completion.costUsd,
        sources: {
          applicationCount: app ? 1 : 0,
          eventCount: events.length,
          logCount: logs.length,
          eventNames: Array.from(new Set(events.map((e) => e.eventName))),
        },
      };
    }

    // Workspace-wide insight (all projects)
    const apps = await this.prisma.application.findMany({
      where: { tenantId: tenantWhere },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const events = await this.prisma.domainEventRecord.findMany({
      where: { tenantId: tenantWhere },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const eventNames = Array.from(new Set(events.map((e) => e.eventName)));
    const snapshot = {
      apps: apps.map((a) => ({
        id: a.id,
        name: a.name,
        runtime: a.runtime,
        status: a.status,
        commitMessage: a.commitMessage,
      })),
      events: events.slice(0, 15).map((e) => ({
        name: e.eventName,
        applicationId: e.applicationId,
        payload: e.payload,
      })),
    };

    const prompt = customPrompt
      ? `${customPrompt}\n\nWorkspace Snapshot:\n${JSON.stringify(snapshot)}`
      : `You are an expert Site Reliability Engineer for AetherHost PaaS.
Analyze this workspace snapshot and provide a concise, high-signal operational briefing.
Keep your entire response strictly under 250 words. Do NOT generate multi-page tables or long bash scripts.
Structure your response using ONLY these exact ## markdown headings so the UI can render them as collapsible sections:
## Fleet Health Overview
(Concise summary of running vs failed vs pending deployments across runtimes)
## Projects Requiring Attention
(Bullet points highlighting any failed or pending projects by name and why they need attention)
## Recommended Next Steps
(2-3 actionable steps in the console, such as clicking Redeploy on failed services or inspecting specific project insights)

Snapshot:
${JSON.stringify(snapshot)}`;

    const completion = await this.aiProxy.complete(
      tenantId,
      prompt,
      'ops_insight',
    );

    return {
      tenantId,
      applicationName: 'All Projects (Workspace)',
      insight: completion.output,
      output: completion.output,
      model: completion.model,
      costUsd: completion.costUsd,
      sources: {
        applicationCount: apps.length,
        eventCount: events.length,
        eventNames,
      },
    };
  }
}
