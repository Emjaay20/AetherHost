import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createAetherPressLaunchpadFiles } from './aetherpress-launchpad.template';

describe('AetherPress Launchpad template', () => {
  it('creates a small runnable app and an explicitly separated static frontend', () => {
    const files = createAetherPressLaunchpadFiles('https://editorial.example.com');
    const byPath = new Map(files.map((file) => [file.path, file.content]));

    expect([...byPath.keys()]).toEqual([
      'package.json', 'server.mjs', 'public/config.js', 'public/index.html', 'public/styles.css', 'public/app.js',
    ]);
    expect(byPath.get('package.json')).toContain('node server.mjs');
    expect(byPath.get('public/index.html')).toContain('WordPress × AetherHost × Spacefast');
    expect(byPath.get('public/app.js')).toContain('replaceChildren');
    expect(byPath.get('public/config.js')).toContain('https://editorial.example.com/wp-json/wp/v2/posts');
    expect(byPath.get('public/config.js')).toContain('https://editorial.example.com/wp-json/aetherpress/v1/insights');
    expect(byPath.get('public/app.js')).toContain('Live reviewed research insights');
    expect(byPath.get('server.mjs')).toContain("file.startsWith(root + sep)");
    expect(byPath.get('server.mjs')).toContain("resolve(process.cwd(), 'public')");
  });

  it('uses bundled content when a WordPress source is intentionally omitted', () => {
    const config = createAetherPressLaunchpadFiles().find((file) => file.path === 'public/config.js');
    expect(config?.content).toContain('"wordpressPostsUrl": null');
  });

  it('emits runnable server and browser JavaScript', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aetherpress-launchpad-'));
    try {
      for (const file of createAetherPressLaunchpadFiles()) {
        mkdirSync(join(directory, file.path, '..'), { recursive: true });
        writeFileSync(join(directory, file.path), file.content);
      }

      for (const fileName of ['server.mjs', 'public/config.js', 'public/app.js']) {
        const result = spawnSync(process.execPath, ['--check', join(directory, fileName)], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('serves only the public frontend files when it runs on AetherHost', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'aetherpress-launchpad-'));
    const port = await unusedPort();
    let child: ReturnType<typeof spawn> | undefined;
    try {
      for (const file of createAetherPressLaunchpadFiles()) {
        mkdirSync(join(directory, file.path, '..'), { recursive: true });
        writeFileSync(join(directory, file.path), file.content);
      }
      child = spawn(process.execPath, ['server.mjs'], {
        cwd: directory,
        env: { ...process.env, PORT: String(port) },
        stdio: 'ignore',
      });
      await waitForPage(`http://127.0.0.1:${port}/`);

      const home = await fetch(`http://127.0.0.1:${port}/`);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('AetherPress Launchpad');
      expect((await fetch(`http://127.0.0.1:${port}/package.json`)).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${port}/server.mjs`)).status).toBe(404);
    } finally {
      child?.kill();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses credentials, non-HTTPS origins, and query fragments', () => {
    expect(() => createAetherPressLaunchpadFiles('http://editorial.example.com')).toThrow(BadRequestException);
    expect(() => createAetherPressLaunchpadFiles('https://user:pass@editorial.example.com')).toThrow(BadRequestException);
    expect(() => createAetherPressLaunchpadFiles('https://editorial.example.com/?private=true')).toThrow(BadRequestException);
  });
});

async function unusedPort() {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve an ephemeral port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function waitForPage(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw lastError ?? new Error('AetherPress server did not become ready');
}
