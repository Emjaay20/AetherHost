import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createAetherPressLaunchpadFiles } from './aetherpress-launchpad.template';

describe('AetherPress Launchpad template', () => {
  it('creates a small runnable app and an eligible static frontend', () => {
    const files = createAetherPressLaunchpadFiles('https://editorial.example.com');
    const byPath = new Map(files.map((file) => [file.path, file.content]));

    expect([...byPath.keys()]).toEqual([
      'package.json', 'server.mjs', 'config.js', 'index.html', 'styles.css', 'app.js',
    ]);
    expect(byPath.get('package.json')).toContain('node server.mjs');
    expect(byPath.get('index.html')).toContain('WordPress × AetherHost × Spacefast');
    expect(byPath.get('app.js')).toContain('replaceChildren');
    expect(byPath.get('config.js')).toContain('https://editorial.example.com/wp-json/wp/v2/posts');
    expect(byPath.get('server.mjs')).toContain("file.startsWith(root + sep)");
  });

  it('uses bundled content when a WordPress source is intentionally omitted', () => {
    const config = createAetherPressLaunchpadFiles().find((file) => file.path === 'config.js');
    expect(config?.content).toContain('"wordpressPostsUrl": null');
  });

  it('emits runnable server and browser JavaScript', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aetherpress-launchpad-'));
    try {
      for (const file of createAetherPressLaunchpadFiles()) {
        writeFileSync(join(directory, file.path), file.content);
      }

      for (const fileName of ['server.mjs', 'config.js', 'app.js']) {
        const result = spawnSync(process.execPath, ['--check', join(directory, fileName)], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses credentials, non-HTTPS origins, and query fragments', () => {
    expect(() => createAetherPressLaunchpadFiles('http://editorial.example.com')).toThrow(BadRequestException);
    expect(() => createAetherPressLaunchpadFiles('https://user:pass@editorial.example.com')).toThrow(BadRequestException);
    expect(() => createAetherPressLaunchpadFiles('https://editorial.example.com/?private=true')).toThrow(BadRequestException);
  });
});
