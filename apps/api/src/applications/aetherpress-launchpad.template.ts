import { BadRequestException } from '@nestjs/common';

export type AetherPressLaunchpadFile = { path: string; content: string };

/**
 * A small, dependency-free companion frontend for the WordPress × AetherHost ×
 * Spacefast demo. The same stored files run as a normal AetherHost Node app
 * and are the only files eligible for an explicit Spacefast publication.
 */
export function createAetherPressLaunchpadFiles(wordpressSiteUrl?: string): AetherPressLaunchpadFile[] {
  const wordpressPostsUrl = normalizeWordPressPostsUrl(wordpressSiteUrl);
  const config = JSON.stringify({ wordpressPostsUrl }, null, 2);

  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'aetherpress-launchpad',
        private: true,
        version: '1.0.0',
        scripts: { start: 'node server.mjs' },
      }, null, 2) + '\n',
    },
    {
      path: 'server.mjs',
      content: `import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = process.cwd();
const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8' };
const server = createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = resolve(root, requested);
  try {
    if (!file.startsWith(root + sep)) throw new Error('unsafe path');
    if (!statSync(file).isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
server.listen(process.env.PORT || 3000, '0.0.0.0');
`,
    },
    {
      path: 'config.js',
      content: `window.AETHERPRESS_CONFIG = ${config};\n`,
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="A WordPress editorial companion delivered through AetherHost and Spacefast." />
    <title>AetherPress Launchpad</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <nav aria-label="Main navigation"><span class="brand"><i></i>AetherPress</span><span class="status" id="source-status">Preparing editorial feed</span></nav>
      <section class="hero" aria-labelledby="hero-heading">
        <p class="eyebrow">WordPress × AetherHost × Spacefast</p>
        <h1 id="hero-heading">Editorial publishing, with a clear deployment boundary.</h1>
        <p class="lede">WordPress owns posts. AetherHost owns the workload and deployment health. This static companion can be published privately to Spacefast without sending a database, plugin, secret, or admin session.</p>
        <div class="flow" aria-label="Integration flow"><span>WordPress content</span><b>→</b><span>AetherHost workload</span><b>→</b><span>Spacefast static frontend</span></div>
      </section>
      <section class="proof" aria-label="Integration safeguards">
        <article><strong>01</strong><h2>Public editorial API</h2><p>Only published post data is requested from the WordPress REST API.</p></article>
        <article><strong>02</strong><h2>Safe static export</h2><p>The selected HTML, CSS, JavaScript and JSON remain inspectable and bounded.</p></article>
        <article><strong>03</strong><h2>Private release</h2><p>Spacefast receives the approved frontend—not the WordPress runtime or AetherHost controls.</p></article>
      </section>
      <section class="stories" aria-labelledby="stories-heading">
        <div class="section-heading"><div><p class="eyebrow">Latest from the newsroom</p><h2 id="stories-heading">Editorial briefs</h2></div><button id="refresh" type="button">Refresh posts</button></div>
        <p id="message" class="message" role="status"></p>
        <div id="stories" class="story-grid" aria-live="polite"></div>
      </section>
    </main>
    <footer>Built as an explicit AetherHost external-frontend artifact. No WordPress credentials are embedded here.</footer>
    <script src="config.js"></script><script src="app.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'styles.css',
      content: `:root{--ink:#15172a;--muted:#5e6278;--paper:#f7f5f0;--panel:#fffefa;--line:#dedbd3;--violet:#5b42d6;--cyan:#62d6e5}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1120px;margin:auto;padding:28px 28px 72px}nav{display:flex;justify-content:space-between;align-items:center;font-size:.88rem}.brand{font-weight:800;letter-spacing:-.03em;font-size:1.1rem;display:flex;gap:.5rem;align-items:center}.brand i{width:22px;height:22px;background:var(--violet);border-radius:6px;box-shadow:8px 8px 0 var(--cyan)}.status{border:1px solid var(--line);border-radius:999px;padding:.45rem .7rem;color:var(--muted);background:var(--panel)}.hero{padding:105px 0 76px;max-width:850px}.eyebrow{font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:var(--violet);margin:0 0 .8rem}.hero h1{font-size:clamp(2.8rem,7vw,5.8rem);line-height:.94;letter-spacing:-.075em;margin:0}.lede{font-size:1.16rem;line-height:1.65;color:var(--muted);max-width:720px;margin:2rem 0}.flow{display:flex;flex-wrap:wrap;gap:.7rem;align-items:center;font-size:.83rem;font-weight:700}.flow span{border:1px solid var(--line);background:var(--panel);border-radius:99px;padding:.55rem .8rem}.flow b{color:var(--violet)}.proof{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;border-top:1px solid var(--line);padding-top:18px}.proof article{border:1px solid var(--line);background:var(--panel);padding:20px;min-height:170px}.proof strong{color:var(--violet);font-size:.76rem}.proof h2{font-size:1rem;margin:1.4rem 0 .4rem}.proof p,.message{font-size:.86rem;line-height:1.55;color:var(--muted);margin:0}.stories{margin-top:96px}.section-heading{display:flex;gap:1rem;align-items:end;justify-content:space-between}.section-heading h2{font-size:2rem;letter-spacing:-.05em;margin:0}.section-heading button{border:1px solid var(--ink);background:var(--ink);color:white;padding:.7rem .9rem;border-radius:6px;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}.section-heading button:hover{background:var(--violet);border-color:var(--violet)}.message{min-height:1.3rem;margin:1rem 0}.story-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.story{background:var(--panel);border:1px solid var(--line);padding:22px;min-height:220px;display:flex;flex-direction:column}.story time{font-size:.76rem;color:var(--violet);font-weight:800}.story h3{font-size:1.18rem;letter-spacing:-.035em;line-height:1.1;margin:1rem 0 .65rem}.story p{font-size:.86rem;color:var(--muted);line-height:1.55;margin:0}.story a{margin-top:auto;padding-top:1.5rem;color:var(--ink);font-size:.82rem;font-weight:800;text-decoration:none}.story a:hover{text-decoration:underline}footer{border-top:1px solid var(--line);padding:24px 28px;color:var(--muted);font-size:.76rem}@media(max-width:720px){main{padding:22px 18px 56px}.hero{padding:72px 0 56px}.proof,.story-grid{grid-template-columns:1fr}.section-heading{align-items:start;flex-direction:column}.status{display:none}}`,
    },
    {
      path: 'app.js',
      content: `const config = window.AETHERPRESS_CONFIG || {};
const stories = document.querySelector('#stories');
const message = document.querySelector('#message');
const sourceStatus = document.querySelector('#source-status');
const fallback = [
  { title: 'A deliberate boundary between editorial content and infrastructure', excerpt: 'This demo starts with the source of truth: WordPress owns the published story.', date: '2026-11-18', link: '#' },
  { title: 'A static companion that does not inherit runtime access', excerpt: 'The selected export remains small, reviewable and independent from deployment credentials.', date: '2026-11-17', link: '#' },
  { title: 'Private publishing is an explicit product action', excerpt: 'A release is auditable and reversible instead of being an implicit side effect of deployment.', date: '2026-11-16', link: '#' },
];

function plainText(value) { const node = document.createElement('div'); node.innerHTML = String(value || ''); return node.textContent || ''; }
function render(posts) {
  stories.replaceChildren();
  posts.forEach((post) => {
    const article = document.createElement('article'); article.className = 'story';
    const time = document.createElement('time'); time.dateTime = post.date || ''; time.textContent = post.date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(post.date)) : 'Editorial brief';
    const heading = document.createElement('h3'); heading.textContent = plainText(post.title?.rendered || post.title);
    const excerpt = document.createElement('p'); excerpt.textContent = plainText(post.excerpt?.rendered || post.excerpt);
    const link = document.createElement('a'); link.href = post.link || '#'; link.textContent = post.link ? 'Read the original post →' : 'Demo content'; if (post.link) { link.target = '_blank'; link.rel = 'noreferrer'; }
    article.append(time, heading, excerpt, link); stories.append(article);
  });
}
async function load() {
  message.textContent = 'Loading published editorial content…';
  if (!config.wordpressPostsUrl) { render(fallback); message.textContent = 'Showing bundled demo content. Add a public WordPress site URL when creating this project to load live posts.'; sourceStatus.textContent = 'Demo content'; return; }
  try {
    const response = await fetch(config.wordpressPostsUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('WordPress returned ' + response.status);
    const posts = await response.json();
    if (!Array.isArray(posts) || posts.length === 0) throw new Error('No published posts were returned');
    render(posts.slice(0, 3)); message.textContent = 'Live published posts from the configured public WordPress REST API.'; sourceStatus.textContent = 'Live WordPress content';
  } catch { render(fallback); message.textContent = 'The public WordPress feed is unavailable, so the static demo is showing safe bundled content.'; sourceStatus.textContent = 'Fallback content'; }
}
document.querySelector('#refresh').addEventListener('click', load); load();
`,
    },
  ];
}

function normalizeWordPressPostsUrl(value?: string) {
  if (!value?.trim()) return null;
  let site: URL;
  try {
    site = new URL(value.trim());
  } catch {
    throw new BadRequestException('Enter a valid public WordPress site URL, including https://');
  }
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) {
    throw new BadRequestException('The WordPress site URL must be a public HTTPS origin without credentials, a query, or a fragment');
  }
  site.pathname = site.pathname.replace(/\/+$/, '');
  return `${site.toString().replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=3&_embed=1&_fields=id,date,link,title,excerpt`;
}
