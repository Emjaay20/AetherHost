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

test('console app rows preserve actions and keep legacy domains inside the Visit menu', () => {
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
  const logViewer = fs.readFileSync(
    path.join(dashboardRoot, 'components', 'DeploymentLogViewer.tsx'),
    'utf8',
  );
  assert.match(cardItem, /redeployApplication/);
  assert.match(cardItem, /isLegacyApplication/);
  assert.match(cardItem, /getLegacyAppUrl/);
  assert.match(cardItem, /\.com\.ng/);
  assert.doesNotMatch(cardItem, /Legacy Domain Active/);
  assert.match(cardItem, /grid-cols-\[minmax\(0,1fr\)_6\.5rem_auto\]/);
  assert.match(logViewer, /if \(!expanded && status !== 'failed'\) return null/);
});

test('console layout keeps navigation fixed and makes dense deployments searchable', () => {
  const appShell = fs.readFileSync(path.join(dashboardRoot, 'components', 'AppShell.tsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(dashboardRoot, 'components', 'Sidebar.tsx'), 'utf8');
  const layout = fs.readFileSync(path.join(dashboardRoot, 'app', 'layout.tsx'), 'utf8');
  const deploymentList = fs.readFileSync(path.join(dashboardRoot, 'components', 'DeploymentList.tsx'), 'utf8');

  assert.match(appShell, /h-screen w-full overflow-hidden/);
  assert.match(sidebar, /aetherhost-sidebar/);
  assert.match(sidebar, /Ctrl\/Cmd\+B/);
  assert.match(layout, /sidebar-preference/);
  assert.match(deploymentList, /Search deployments/);
  assert.match(deploymentList, /statusRank/);
  assert.match(deploymentList, /option value="failed"/);
});

test('proxy.ts enforces canonical domain redirect to aetherhost.app and admin route protection on /admin(.*)', () => {
  const proxyContent = fs.readFileSync(
    path.join(dashboardRoot, 'proxy.ts'),
    'utf8',
  );
  assert.match(proxyContent, /aetherhost\.com\.ng/);
  assert.match(proxyContent, /https:\/\/aetherhost\.app/);
  assert.match(proxyContent, /isAdminRoute/);
  assert.match(proxyContent, /ADMIN_TENANT_IDS/);
});
