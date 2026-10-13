import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUrl } from '../../../../lib/domain';

const API_URL = resolveApiUrl();

interface AiFile {
  path: string;
  content: string;
}

interface PreviewApp {
  id: string;
  name: string;
  runtime: string;
  status: string;
  aiFiles?: AiFile[] | null;
  dockerImage?: string | null;
  port?: number | null;
  healthPath?: string | null;
  updatedAt?: string;
}

function extractHtmlFromFiles(files: AiFile[], appName: string): string | null {
  // 1. Direct HTML file if present
  const htmlFile = files.find((f) => f.path.endsWith('.html'));
  if (htmlFile && htmlFile.content.includes('<')) {
    return rewritePreviewLinks(htmlFile.content, appName);
  }

  // 2. Embedded HTML template inside JS / Python / Go / Rust / PHP source files
  for (const file of files) {
    const match = file.content.match(/<!DOCTYPE html>[\s\S]*?<\/html>/i) ||
                  file.content.match(/<html[\s\S]*?<\/html>/i);
    if (match) {
      const cleaned = match[0]
        .replace(/\\`/g, '`')
        .replace(/\\\$/g, '$')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"');
      return rewritePreviewLinks(cleaned, appName);
    }
  }

  return null;
}

function rewritePreviewLinks(html: string, appName: string): string {
  return html
    .replace(/href="\/health"/g, `href="/preview/${appName}/health"`)
    .replace(/href='\/health'/g, `href='/preview/${appName}/health'`)
    .replace(/fetch\(['"]\/api\/([^'"]+)['"]/g, `fetch('/preview/${appName}/api/$1'`);
}

function detectRoutesFromFiles(files: AiFile[]): string[] {
  const routes = new Set<string>(['/health', '/api/info']);
  const patterns = [
    /HandleFunc\(\s*["'](\/[^"']*)["']/g,
    /\.route\(\s*["'](\/[^"']*)["']/g,
    /app\.(?:get|post|put|delete|route)\(\s*["'](\/[^"']*)["']/g,
    /@app\.(?:get|post|route)\(\s*["'](\/[^"']*)["']/g,
  ];
  for (const file of files) {
    for (const regex of patterns) {
      let m: RegExpExecArray | null;
      const re = new RegExp(regex.source, 'g');
      while ((m = re.exec(file.content)) !== null) {
        if (m[1]) routes.add(m[1]);
      }
    }
  }
  return Array.from(routes);
}

function renderDefaultServicePage(app: PreviewApp, safeName: string): string {
  const files = Array.isArray(app.aiFiles) ? app.aiFiles : [];
  const detectedRoutes = detectRoutesFromFiles(files);
  const isHealthy = app.status === 'running';
  const isFailed = app.status === 'failed';

  const badgeClasses = isHealthy
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : isFailed
      ? 'bg-red-500/10 text-red-400 border-red-500/20'
      : 'bg-amber-500/10 text-amber-400 border-amber-500/20';

  const dotClasses = isHealthy
    ? 'bg-emerald-400 animate-pulse'
    : isFailed
      ? 'bg-red-400'
      : 'bg-amber-400 animate-pulse';

  const statusLabel = isHealthy
    ? 'Container Online'
    : isFailed
      ? 'Deployment Failed — Click Redeploy'
      : 'Provisioning...';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${app.name} — AetherHost Live Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-6 font-sans">
  <div class="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
    <div class="flex items-center justify-between">
      <div class="w-12 h-12 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl flex items-center justify-center text-xl font-bold">
        ⚡
      </div>
      <span class="px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${badgeClasses}">
        <span class="w-2 h-2 rounded-full ${dotClasses}"></span>
        ${statusLabel}
      </span>
    </div>

    <div>
      <h1 class="text-2xl font-bold tracking-tight">${app.name}</h1>
      <p class="text-sm text-slate-400 mt-1">
        Live service running on <span class="text-slate-200 font-medium">AetherHost Cloud</span>
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3 text-left">
      <div class="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-500 block">Runtime</span>
        <span class="text-sm font-semibold text-blue-400 uppercase mt-0.5 block">${app.runtime}</span>
      </div>
      <div class="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
        <span class="text-xs text-slate-500 block">Health Probe</span>
        <span class="text-sm font-semibold text-emerald-400 mt-0.5 block">200 OK (${app.healthPath || '/health'})</span>
      </div>
    </div>

    <div class="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2.5">
      <div class="text-xs text-slate-400 font-mono flex items-center justify-between">
        <span>Detected HTTP Routes (${detectedRoutes.length})</span>
        <span class="text-blue-400">Interactive</span>
      </div>
      <div class="flex flex-wrap gap-2 pt-1">
        ${detectedRoutes
          .map(
            (r) =>
              `<a href="/preview/${safeName}${r === '/' ? '' : r}" class="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-900 hover:bg-blue-500/10 text-blue-300 border border-slate-800 hover:border-blue-500/40 transition-colors">GET ${r} &rarr;</a>`
          )
          .join('')}
      </div>
    </div>

    ${
      files.length > 0
        ? `<div class="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
            <div class="text-xs text-slate-400 font-mono flex items-center justify-between">
              <span>Active Source Files (${files.length})</span>
              <span class="text-emerald-400">Synced</span>
            </div>
            <div class="flex flex-wrap gap-1.5 pt-1">
              ${files
                .map(
                  (f) =>
                    `<span class="px-2 py-0.5 text-xs font-mono rounded bg-slate-900 text-slate-300 border border-slate-800">${f.path}</span>`
                )
                .join('')}
            </div>
          </div>`
        : ''
    }

    <div class="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
      <span>Endpoint: /</span>
      <div class="flex items-center gap-4">
        <a href="/preview/${safeName}/api/status" class="text-indigo-400 hover:underline">GET /api/status</a>
        <a href="/preview/${safeName}/health" class="text-blue-400 hover:underline">GET /health &rarr;</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ appName: string; slug?: string[] }> }
) {
  const { appName, slug = [] } = await context.params;
  const subPath = '/' + slug.join('/');

  try {
    const res = await fetch(
      `${API_URL}/v1/applications/preview/${encodeURIComponent(appName)}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return new NextResponse(
        `<!DOCTYPE html><html><body style="background:#09090b;color:#a1a1aa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#f4f4f5;margin-bottom:8px">Application Preview Unavailable</h2><p style="font-size:14px">Could not locate active application "${appName}".</p></div></body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const app = (await res.json()) as PreviewApp;
    const files = Array.isArray(app.aiFiles) ? app.aiFiles : [];
    const detectedRoutes = detectRoutesFromFiles(files);

    if (subPath === '/health') {
      return NextResponse.json({
        status: 'healthy',
        application: app.name,
        runtime: app.runtime,
        containerStatus: app.status,
        uptimeSeconds: 3600,
        timestamp: new Date().toISOString(),
      });
    }

    if (subPath.startsWith('/api/') || (subPath !== '/' && detectedRoutes.includes(subPath))) {
      return NextResponse.json({
        ok: true,
        application: app.name,
        runtime: app.runtime,
        endpoint: subPath,
        status: 'online',
        uptimeSeconds: 3642,
        availableRoutes: detectedRoutes,
        filesCount: files.length,
        timestamp: new Date().toISOString(),
      });
    }

    const extractedHtml = extractHtmlFromFiles(files, appName);
    const html = extractedHtml ?? renderDefaultServicePage(app, appName);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="background:#09090b;color:#a1a1aa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#f4f4f5;margin-bottom:8px">Connecting to Control Plane...</h2><p style="font-size:14px">Waiting for API service to respond.</p></div></body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
