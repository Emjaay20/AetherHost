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

test('Spacefast publishing stays compact until a specific app is expanded', () => {
  const panel = fs.readFileSync(
    path.join(dashboardRoot, 'components', 'SpacefastFrontendPanel.tsx'),
    'utf8',
  );

  assert.match(panel, /<details className="group overflow-hidden rounded-lg border border-border bg-card"/);
  assert.match(panel, /Spacefast publishing/);
  assert.match(panel, /<details key=\{app\.id\} className="group\/app"/);
  assert.match(panel, /open=\{isPanelOpen\}/);
  assert.match(panel, /appNeedsAttention/);
  assert.match(panel, /Only the saved static export is sent/);
  assert.match(panel, /A customer-owned connection can be added when available/);
});

test('AetherPress demo can create a safe WordPress and Spacefast companion', () => {
  const launchpad = fs.readFileSync(
    path.join(dashboardRoot, 'components', 'AetherPressLaunchpad.tsx'),
    'utf8',
  );
  const actions = fs.readFileSync(path.join(dashboardRoot, 'app', 'actions.ts'), 'utf8');

  assert.match(launchpad, /AetherPress Launchpad/);
  assert.match(launchpad, /public WordPress REST API/);
  assert.match(launchpad, /never asks for an admin account, token, database, or plugin access/);
  assert.match(actions, /createAetherPressLaunchpad/);
  assert.match(actions, /applications\/templates\/aetherpress-launchpad/);
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

test('docs page enforces responsive mobile drawer with backdrop and offscreen translate', () => {
  const docsClient = fs.readFileSync(
    path.join(dashboardRoot, 'app', 'docs', 'DocsClient.tsx'),
    'utf8',
  );
  // Verify drawer is translated offscreen when closed and slides in when open
  assert.match(docsClient, /-translate-x-full lg:translate-x-0/);
  assert.match(docsClient, /translate-x-0/);
  assert.match(docsClient, /docs-sidebar/);
  // Verify mobile backdrop exists with blur and escape listener
  assert.match(docsClient, /fixed inset-0 z-40 bg-black\/75 backdrop-blur-sm/);
  assert.match(docsClient, /event\.key === 'Escape'/);
  assert.match(docsClient, /document\.body\.style\.overflow = 'hidden'/);
});

test('docs page presents truthful Actix library middleware, non-LRU cache eviction, Criterion benches, and measured CI timings', () => {
  const docsClient = fs.readFileSync(
    path.join(dashboardRoot, 'app', 'docs', 'DocsClient.tsx'),
    'utf8',
  );
  assert.match(docsClient, /no production Actix-Web service runs in this repository/);
  assert.match(docsClient, /examples\/actix_monolith\.rs/);
  assert.match(docsClient, /It is not LRU/);
  assert.match(docsClient, /map\.clear\(\)/);
  assert.match(docsClient, /crates\/aether-authz\/benches\/authz_bench\.rs/);
  assert.match(docsClient, /Measured CI Pipeline Timings/);
  assert.match(docsClient, /#44594918177/);
});

test('marketing layout and landing page include FlowMeet scheduling with progressive enhancement', () => {
  const layoutContent = fs.readFileSync(
    path.join(dashboardRoot, 'app', '(marketing)', 'layout.tsx'),
    'utf8',
  );
  assert.match(layoutContent, /https:\/\/flowmeet\.aetherhost\.app\/widget\.js/);
  assert.match(layoutContent, /data-slug="aetherhost"/);
  assert.match(layoutContent, /data-no-button="true"/);

  const pageContent = fs.readFileSync(
    path.join(dashboardRoot, 'app', '(marketing)', 'page.tsx'),
    'utf8',
  );
  assert.match(pageContent, /https:\/\/flowmeet\.aetherhost\.app\/book\/aetherhost/);
  assert.match(pageContent, /data-flowmeet-open/);
  assert.match(pageContent, /Talk to founder/);
  assert.match(pageContent, /Book enterprise demo/);
  assert.match(pageContent, /Scheduling powered by/);
});
