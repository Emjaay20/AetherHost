export class AiFileSanitizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiFileSanitizerError';
  }
}

export type AiSourceFile = { path: string; content: string };

export const AI_FILE_RULES = `File rules:
- File content must be raw source. After JSON parsing, source must contain real newline characters, never the two-character sequence backslash-n, and package.json must be valid JSON.
- package.json must include a start script. Do not use npm ci unless package-lock.json is also in files. Use npm install.
- In a Dockerfile, COPY source (src, public, tsconfig) before any RUN that compiles (npm run build, tsc).
- NestJS 10 or newer must depend on @nestjs/platform-express at the same version as @nestjs/core, and must use @nestjs/serve-static ^4 or newer. Never pair @nestjs/serve-static 3 with NestJS 10.
- Next.js projects: any component using framer-motion, useState, useEffect or event handlers must start with 'use client'. Provide next.config.js with typescript.ignoreBuildErrors and eslint.ignoreDuringBuilds set to true, and add an app/health/route.ts returning HTTP 200.
- Listen on process.env.PORT and answer GET /health with HTTP 200.`;

export function sanitizeAiFiles(files: AiSourceFile[]): AiSourceFile[] {
  if (!Array.isArray(files)) {
    throw new AiFileSanitizerError('files must be an array');
  }

  const normalized = files.map((file) => {
    const path = assertSafePath(file?.path);
    return {
      path,
      content: normalizeFileContent(String(file?.content ?? '')),
    };
  });

  return repairProject(normalized);
}

export function normalizeFileContent(content: string): string {
  let current = unwrapJsonString(content);
  for (let i = 0; i < 3; i++) {
    const next = unescapePass(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function repairProject(files: AiSourceFile[]): AiSourceFile[] {
  const hasLock = files.some((file) =>
    /(^|\/)(package-lock\.json|npm-shrinkwrap\.json)$/.test(file.path),
  );
  const usesNest = files.some((file) => file.content.includes('@nestjs/'));
  const usesNext = files.some(
    (file) => isPackageJson(file.path) && /"next"\s*:/.test(file.content),
  );

  const mapped = files.map((file) => {
    if (usesNext) {
      if (/(^|\/)next\.config\.(js|mjs|cjs)$/.test(file.path)) {
        return { ...file, content: repairNextConfig(file.content) };
      }
      if (/\.(tsx|jsx)$/.test(file.path)) {
        return { ...file, content: repairUseClient(file.content) };
      }
    }
    if (isPackageJson(file.path)) {
      return { ...file, content: repairPackageJson(file.content) };
    }
    if (file.path === 'Dockerfile' || file.path.endsWith('/Dockerfile')) {
      return { ...file, content: repairDockerfile(file.content, hasLock) };
    }
    if (file.path === 'docker-compose.yml' || file.path.endsWith('/docker-compose.yml')) {
      return { ...file, content: repairCompose(file.content, hasLock) };
    }
    if (usesNest && (file.path === 'tsconfig.json' || file.path.endsWith('/tsconfig.json'))) {
      return { ...file, content: repairTsconfig(file.content) };
    }
    if (usesNest && (file.path === 'src/main.ts' || file.path.endsWith('/src/main.ts'))) {
      return { ...file, content: repairNestMain(file.content) };
    }
    return file;
  });

  if (usesNext && !mapped.some((f) => /(^|\/)next\.config\.(js|mjs|cjs)$/.test(f.path))) {
    mapped.push({ path: 'next.config.js', content: repairNextConfig('') });
  }
  return mapped;
}

/** Next.js builds must never fail on AI-generated type/lint nits. */
function repairNextConfig(content: string): string {
  if (/ignoreBuildErrors\s*:\s*true/.test(content) && /ignoreDuringBuilds\s*:\s*true/.test(content)) {
    return content;
  }
  const isEsm = /\bexport\s+default\b/.test(content);
  const base = `{\n  typescript: { ignoreBuildErrors: true },\n  eslint: { ignoreDuringBuilds: true },\n}`;
  if (!content.trim()) {
    return `/** @type {import('next').NextConfig} */\nmodule.exports = ${base};\n`;
  }
  // Merge into an existing simple config rather than discarding user options.
  const match = content.match(/(?:module\.exports\s*=|export\s+default)\s*(\w+)?\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (match && !match[1]) {
    const merged = match[2].replace(
      /^\{/,
      '{\n  typescript: { ignoreBuildErrors: true },\n  eslint: { ignoreDuringBuilds: true },',
    );
    return content.replace(match[2], merged);
  }
  return isEsm
    ? `${content}\n`
    : `${content}\nmodule.exports.typescript = { ...(module.exports.typescript || {}), ignoreBuildErrors: true };\nmodule.exports.eslint = { ...(module.exports.eslint || {}), ignoreDuringBuilds: true };\n`;
}

/** Add 'use client' to client-only components (framer-motion, hooks, handlers). */
function repairUseClient(content: string): string {
  if (/^\s*['"]use (client|server)['"]/.test(content)) return content;
  const needsClient =
    /from\s+['"]framer-motion['"]/.test(content) ||
    /\buse(State|Effect|Ref|Reducer|Context|Router|Pathname)\s*\(/.test(content) ||
    /\bon(Click|Change|Submit)\s*=/.test(content);
  return needsClient ? `'use client';\n\n${content}` : content;
}

function unwrapJsonString(content: string): string {
  const trimmed = content.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) return content;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' ? parsed : content;
  } catch {
    return content;
  }
}

function unescapePass(content: string): string {
  let next = content;
  const realNewlines = countChar(next, '\n');
  const escapedNewlines = countSequence(next, '\\n');
  if (realNewlines === 0 && escapedNewlines >= 1) {
    next = next
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }
  const quotes = quoteStats(next);
  if (quotes.escaped >= 1 && quotes.raw === 0) {
    next = next.replace(/\\"/g, '"');
  }
  return next;
}

function repairPackageJson(content: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new AiFileSanitizerError(
      `package.json is not valid JSON (${reason}). Refusing to deploy.`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AiFileSanitizerError('package.json must be a JSON object');
  }

  parsed.scripts = parsed.scripts && typeof parsed.scripts === 'object' ? parsed.scripts : {};
  if (!parsed.scripts.start) {
    if (typeof parsed.scripts['start:dev'] === 'string') {
      parsed.scripts.start = parsed.scripts['start:dev'];
    } else if (typeof parsed.main === 'string' && parsed.main.trim()) {
      parsed.scripts.start = `node ${parsed.main.trim()}`;
    } else {
      parsed.scripts.start = 'node dist/main.js';
    }
  }

  parsed.dependencies =
    parsed.dependencies && typeof parsed.dependencies === 'object' ? parsed.dependencies : {};
  const deps = parsed.dependencies as Record<string, string>;
  const nestMajor = majorOf(deps['@nestjs/common'] || deps['@nestjs/core']);
  const staticMajor = majorOf(deps['@nestjs/serve-static']);
  if (nestMajor !== null && nestMajor >= 10 && staticMajor !== null && staticMajor < 4) {
    deps['@nestjs/serve-static'] = '^4.0.2';
  }
  if (deps['@nestjs/core'] && !deps['@nestjs/platform-express']) {
    deps['@nestjs/platform-express'] = deps['@nestjs/core'];
  }

  const dev =
    parsed.devDependencies && typeof parsed.devDependencies === 'object'
      ? parsed.devDependencies
      : {};
  const hasTypescript = Boolean(dev.typescript || deps.typescript);
  if (hasTypescript && !dev['@types/node'] && !deps['@types/node']) {
    dev['@types/node'] = '^20.17.0';
    parsed.devDependencies = dev;
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function repairDockerfile(content: string, hasLock: boolean): string {
  const text = repairCompose(content, hasLock);
  const lines = text.split('\n');
  const buildIdx = lines.findIndex(
    (line) => /^\s*RUN\b/i.test(line) && /\b(npm\s+run\s+build|npx\s+tsc|\btsc\b)/.test(line),
  );
  if (buildIdx === -1) return ensureNewline(text);

  const sourceAfter = lines.findIndex(
    (line, index) => index > buildIdx && isSourceCopy(line),
  );
  if (sourceAfter === -1) return ensureNewline(text);

  const next = [...lines];
  const split = splitInstallAndBuild(next[buildIdx]);
  if (split) {
    next[buildIdx] = split.install;
    const insertAt = lastSourceCopyIndex(next, sourceAfter) + 1;
    next.splice(insertAt, 0, split.build);
  } else {
    const [removed] = next.splice(buildIdx, 1);
    const insertAt = lastSourceCopyIndex(next, 0) + 1;
    next.splice(insertAt, 0, removed);
  }
  return ensureNewline(next.join('\n'));
}

function repairCompose(content: string, hasLock: boolean): string {
  if (hasLock) return content;
  return content.replace(/\bnpm\s+ci\b/g, 'npm install');
}

function repairTsconfig(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return content;
    parsed.compilerOptions =
      parsed.compilerOptions && typeof parsed.compilerOptions === 'object'
        ? parsed.compilerOptions
        : {};
    parsed.compilerOptions.experimentalDecorators = true;
    parsed.compilerOptions.emitDecoratorMetadata = true;
    return `${JSON.stringify(parsed, null, 2)}\n`;
  } catch {
    return content;
  }
}

function repairNestMain(content: string): string {
  if (!content.includes('NestFactory') || content.includes('reflect-metadata')) return content;
  return `import 'reflect-metadata';\n${content.endsWith('\n') ? content : `${content}\n`}`;
}

function splitInstallAndBuild(line: string): { install: string; build: string } | null {
  const match = line.match(/^(\s*RUN\s+)(.*)$/i);
  if (!match) return null;
  const parts = match[2].split(/\s*&&\s*/);
  const buildParts = parts.filter((part) => /\b(npm\s+run\s+build|npx\s+tsc|\btsc\b)/.test(part));
  const other = parts.filter((part) => !buildParts.includes(part));
  if (buildParts.length === 0 || other.length === 0) return null;
  return {
    install: `${match[1]}${other.join(' && ')}`,
    build: `${match[1]}${buildParts.join(' && ')}`,
  };
}

function isSourceCopy(line: string): boolean {
  if (!/^\s*COPY\b/i.test(line)) return false;
  const rest = line.replace(/^\s*COPY\s+/i, '');
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const sources = tokens.slice(0, -1);
  return !sources.every((token) =>
    /^(package\.json|package-lock\.json|npm-shrinkwrap\.json)$/.test(token),
  );
}

function lastSourceCopyIndex(lines: string[], from: number): number {
  let last = -1;
  for (let i = from; i < lines.length; i++) {
    if (isSourceCopy(lines[i])) last = i;
  }
  return last;
}

function isPackageJson(path: string): boolean {
  return path === 'package.json' || path.endsWith('/package.json');
}

function assertSafePath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new AiFileSanitizerError('File path is missing');
  }
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    normalized.startsWith('/') ||
    normalized.split('/').includes('..') ||
    normalized.includes('\0')
  ) {
    throw new AiFileSanitizerError(`Unsafe file path: ${path}`);
  }
  return normalized;
}

function majorOf(range: string | undefined): number | null {
  if (!range) return null;
  const match = String(range).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function quoteStats(content: string): { escaped: number; raw: number } {
  let escaped = 0;
  let raw = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && content[i + 1] === '"') {
      escaped++;
      i++;
      continue;
    }
    if (content[i] === '"') raw++;
  }
  return { escaped, raw };
}

function countChar(content: string, ch: string): number {
  return content.split(ch).length - 1;
}

function countSequence(content: string, sequence: string): number {
  return content.split(sequence).length - 1;
}

function ensureNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}
