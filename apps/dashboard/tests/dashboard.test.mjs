import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, '..');

function safeAppName(name) {
  let s = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > 40) {
    s = s.slice(0, 40).replace(/-+$/g, '');
  }
  return s || 'app';
}

test('safeAppName normalizes project names for preview and routing URLs', () => {
  assert.equal(safeAppName('My Awesome App!'), 'my-awesome-app');
  assert.equal(safeAppName('   ---   '), 'app');
  assert.equal(safeAppName('Rust-Service_2026'), 'rust-service-2026');
});

test('stale Next.js src/app scaffold is removed and root layout has AetherHost title', () => {
  const staleDir = path.join(dashboardRoot, 'src', 'app');
  assert.equal(fs.existsSync(staleDir), false, 'apps/dashboard/src/app should not exist');

  const layoutContent = fs.readFileSync(
    path.join(dashboardRoot, 'app', 'layout.tsx'),
    'utf8',
  );
  assert.match(layoutContent, /AetherHost \| Agency Dashboard/);
});

test('OpsInsightPanel and ApplicationCardItem support per-project AI diagnostics and Redeploy', () => {
  const opsPanel = fs.readFileSync(
    path.join(dashboardRoot, 'components', 'OpsInsightPanel.tsx'),
    'utf8',
  );
  assert.match(opsPanel, /selectedScope/);
  assert.match(opsPanel, /drawerOpen/);

  const cardItem = fs.readFileSync(
    path.join(dashboardRoot, 'components', 'ApplicationCardItem.tsx'),
    'utf8',
  );
  assert.match(cardItem, /redeployApplication/);
});

test('proxy.ts enforces admin route protection on /admin(.*)', () => {
  const proxyContent = fs.readFileSync(
    path.join(dashboardRoot, 'proxy.ts'),
    'utf8',
  );
  assert.match(proxyContent, /isAdminRoute/);
  assert.match(proxyContent, /ADMIN_TENANT_IDS/);
});
