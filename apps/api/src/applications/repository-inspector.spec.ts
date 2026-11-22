import { inspectRepositoryFiles } from './repository-inspector';

describe('inspectRepositoryFiles', () => {
  it('recognizes a Next.js pnpm monorepo without claiming it has a Dockerfile', () => {
    const result = inspectRepositoryFiles([
      { path: 'pnpm-workspace.yaml', content: 'packages:\n  - apps/*' },
      { path: 'apps/web/package.json', content: '{"dependencies":{"next":"16.0.0"}}' },
      { path: 'pnpm-lock.yaml', content: 'lockfileVersion: 9' },
    ]);

    expect(result).toMatchObject({
      framework: 'Next.js',
      runtime: 'nodejs',
      packageManager: 'pnpm',
      monorepo: true,
      dockerfile: false,
      suggestedPort: 3000,
    });
  });

  it('keeps a checked-in Dockerfile authoritative while detecting the source stack', () => {
    const result = inspectRepositoryFiles([
      { path: 'Dockerfile', content: 'FROM node:22-alpine' },
      { path: 'package.json', content: '{"dependencies":{"vite":"6.0.0"}}' },
      { path: 'vite.config.ts', content: 'export default {}' },
    ]);

    expect(result).toMatchObject({
      framework: 'Vite',
      runtime: 'nodejs',
      dockerfile: true,
      suggestedPort: 4173,
    });
    expect(result.notes.join(' ')).toContain('authoritative');
  });
});
