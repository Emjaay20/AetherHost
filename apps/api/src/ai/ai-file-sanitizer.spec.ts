import { AiFileSanitizerError, sanitizeAiFiles } from './ai-file-sanitizer';

const escapedPackage = '{\\n  \\"name\\": \\"signaldesk\\",\\n  \\"version\\": \\"0.1.0\\",\\n  \\"scripts\\": {\\n    \\"start:dev\\": \\"ts-node src/main.ts\\"\\n  }\\n}\\n';
const escapedMain =
  "import { NestFactory } from '@nestjs/core';\\nimport { AppModule } from './app.module';\\n\\nasync function bootstrap() {\\n  const app = await NestFactory.create(AppModule);\\n  const port = process.env.PORT || 80;\\n  await app.listen(port);\\n}\\nbootstrap();";

describe('sanitizeAiFiles', () => {
  it('turns escaped package.json and source into real files', () => {
    const [pkg, main] = sanitizeAiFiles([
      { path: 'package.json', content: escapedPackage },
      { path: 'src/main.ts', content: escapedMain },
    ]);

    expect(JSON.parse(pkg.content).name).toBe('signaldesk');
    expect(JSON.parse(pkg.content).scripts.start).toBe('ts-node src/main.ts');
    expect(main.content).toContain("import { NestFactory }");
    expect(main.content).toContain('\n');
    expect(main.content).not.toContain('\\n');
    expect(main.content.startsWith("import 'reflect-metadata';")).toBe(true);
  });

  it('unescapes quotes in html that already has real newlines', () => {
    const [html] = sanitizeAiFiles([
      {
        path: 'public/index.html',
        content: '<html lang=\\"en\\">\n<head><title>Signaldesk</title></head>\n</html>\n',
      },
    ]);

    expect(html.content).toContain('<html lang="en">');
    expect(html.content).not.toContain('\\"');
  });

  it('repairs a Dockerfile that builds before copying source and uses npm ci', () => {
    const files = sanitizeAiFiles([
      { path: 'package.json', content: '{"name":"signaldesk","version":"0.1.0"}\n' },
      {
        path: 'Dockerfile',
        content: [
          'FROM node:20-alpine',
          'WORKDIR /app',
          'COPY package.json ./',
          'RUN npm ci && npm run build',
          'COPY src ./src',
          'COPY tsconfig.json ./',
          'CMD ["npm", "run", "start"]',
          '',
        ].join('\n'),
      },
    ]);

    const docker = files.find((file) => file.path === 'Dockerfile');
    if (!docker) throw new Error('missing Dockerfile');
    const installAt = docker.content.indexOf('RUN npm install');
    const copySrcAt = docker.content.indexOf('COPY src ./src');
    const buildAt = docker.content.indexOf('RUN npm run build');
    expect(docker.content).not.toContain('npm ci');
    expect(installAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(copySrcAt);
  });

  it('bumps NestJS 10 incompatible serve-static and adds the http adapter', () => {
    const [pkg] = sanitizeAiFiles([
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'signaldesk',
          dependencies: {
            '@nestjs/common': '^10.0.0',
            '@nestjs/core': '^10.0.0',
            '@nestjs/serve-static': '^3.0.0',
          },
          scripts: { start: 'node dist/main.js', build: 'tsc' },
          devDependencies: { typescript: '^5' },
        }),
      },
    ]);
    const parsed = JSON.parse(pkg.content);
    expect(parsed.dependencies['@nestjs/serve-static']).toBe('^4.0.2');
    expect(parsed.dependencies['@nestjs/platform-express']).toBe('^10.0.0');
    expect(parsed.devDependencies['@types/node']).toBe('^20.17.0');
  });

  it('enables Nest decorator flags in tsconfig', () => {
    const files = sanitizeAiFiles([
      { path: 'src/app.module.ts', content: "import { Module } from '@nestjs/common';\n" },
      { path: 'tsconfig.json', content: '{"compilerOptions":{"strict":true}}\n' },
    ]);
    const tsconfig = files.find((file) => file.path === 'tsconfig.json');
    if (!tsconfig) throw new Error('missing tsconfig');
    const parsed = JSON.parse(tsconfig.content);
    expect(parsed.compilerOptions.experimentalDecorators).toBe(true);
    expect(parsed.compilerOptions.emitDecoratorMetadata).toBe(true);
  });

  it('unescapes a one-line file with a single escaped newline', () => {
    const [worker] = sanitizeAiFiles([
      { path: 'src/worker.ts', content: "console.log('a');\\nconsole.log('b');" },
    ]);
    expect(worker.content).toBe("console.log('a');\nconsole.log('b');");
  });

  it('refuses an unrepairable package.json', () => {
    expect(() =>
      sanitizeAiFiles([{ path: 'package.json', content: '{ not json' }]),
    ).toThrow(AiFileSanitizerError);
  });

  it('refuses unsafe paths', () => {
    expect(() =>
      sanitizeAiFiles([{ path: '../etc/passwd', content: 'x' }]),
    ).toThrow(/Unsafe file path/);
  });
});

describe('Next.js repairs', () => {
  it('adds use client, config, and ignores build errors', () => {
    const out = sanitizeAiFiles([
      { path: 'package.json', content: '{"dependencies":{"next":"13.5.6"}}' },
      { path: 'app/page.tsx', content: "import { motion } from 'framer-motion';\nexport default function P(){return <motion.h1/>}\n" },
      { path: 'next.config.js', content: "module.exports = { reactStrictMode: true };\n" },
    ]);
    expect(out.find((f) => f.path === 'app/page.tsx')!.content.startsWith("'use client'")).toBe(true);
    const cfg = out.find((f) => f.path === 'next.config.js')!.content;
    expect(cfg).toContain('ignoreBuildErrors: true');
    expect(cfg).toContain('reactStrictMode');
  });
});
