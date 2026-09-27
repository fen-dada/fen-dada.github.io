import { readFile, readdir, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { build } from 'esbuild';

const root = process.cwd();
const out = path.join(root, 'dist');
const config = JSON.parse(await readFile('site.config.json', 'utf8'));
const projects = JSON.parse(await readFile('content/projects.json', 'utf8'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const arrow = '<span aria-hidden="true">↗</span>';
const routes = [];
const year = new Date().getUTCFullYear();
const renderContent = markdown => sanitizeHtml(marked.parse(markdown), {
  allowedTags: ['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','blockquote','ul','ol','li','pre','code','a','img','hr','table','thead','tbody','tr','th','td','sup','sub'],
  allowedAttributes: { a: ['href','title','id'], img: ['src','alt','title'], ol: ['start'], th: ['colspan','rowspan'], td: ['colspan','rowspan'], code: ['class'] },
  allowedSchemes: ['http','https','mailto'], allowedSchemesByTag: { img: ['https','http','data'] }, allowProtocolRelative: false,
});

for (const project of projects) {
  if (!project.name || !project.description || !/^https:\/\//.test(project.url)) throw new Error('Invalid project metadata');
}

async function posts(type) {
  const list = [];
  for (const filename of await readdir(`content/${type}`)) {
    if (!filename.endsWith('.md') || filename.startsWith('_')) continue;
    const slug = filename.slice(0, -3);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error(`${filename}: use an English or pinyin filename with hyphens`);
    const { data, content } = matter(await readFile(`content/${type}/${filename}`, 'utf8'));
    if (data.draft === true) continue;
    if (data.draft !== undefined && data.draft !== false) throw new Error(`${filename}: draft must be true or false`);
    if (typeof data.title !== 'string' || !data.title.trim()) throw new Error(`${filename}: title is required`);
    const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error(`${filename}: date must be YYYY-MM-DD`);
    if (!content.trim()) throw new Error(`${filename}: published content cannot be empty`);
    if (data.series !== undefined && (typeof data.series !== 'string' || !data.series.trim())) throw new Error(`${filename}: series must be a nonempty string`);
    if (data.series && (!Number.isInteger(data.order) || data.order < 1)) throw new Error(`${filename}: series chapters need a positive integer order`);
    const cjk = (content.match(/[\u3400-\u9fff]/g) || []).length;
    const words = (content.replace(/[\u3400-\u9fff]/g, '').match(/\b\w+\b/g) || []).length;
    list.push({ ...data, slug, type, date, content, url: `/${type}/${slug}/`, minutes: Math.max(1, Math.ceil(cjk / 400 + words / 200)) });
  }
  return list.sort((a,b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

const essays = await posts('essays');
const fiction = await posts('fiction');
const collections = [...new Set(fiction.filter(p => p.series).map(p => p.series))].map(name => {
  const chapters = fiction.filter(p => p.series === name).sort((a,b) => a.order - b.order);
  if (new Set(chapters.map(p => p.order)).size !== chapters.length) throw new Error(`${name}: duplicate chapter order`);
  return { name, chapters, url: `/fiction/series/${createHash('sha256').update(name).digest('hex').slice(0,12)}/` };
});

function shell({ title, description = config.description, url, active, content, article = false }) {
  const nav = [['/', '首页', 'home'], ['/projects/', '项目', 'projects'], ['/essays/', '随笔', 'essays'], ['/fiction/', '小说', 'fiction']];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title ? `${title} · ${config.name}` : config.name + ' · 项目、随笔与小说')}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#fafafa">
  <link rel="canonical" href="${esc(config.url + url)}">
  <meta property="og:type" content="${article ? 'article' : 'website'}">
  <meta property="og:title" content="${esc(title || config.name)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(config.url + url)}">
  <meta property="og:locale" content="zh_CN">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <a class="skip-link" href="#main">跳到正文</a>
  <header class="site-header wrap">
    <a class="brand" href="/" aria-label="${esc(config.name)} 首页">${esc(config.name)}<span class="brand-point" aria-hidden="true">.</span></a>
    <nav aria-label="主导航">${nav.map(([href,label,key]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <a class="github-link" href="/admin/">写作台 ${arrow}</a>
  </header>
  <main id="main" class="wrap${article ? ' reading-wrap' : ''}">${content}</main>
  <footer class="site-footer wrap"><span>© ${year} ${esc(config.name)}</span><span><a href="/admin/">写作台</a><span class="footer-separator" aria-hidden="true"> / </span><a href="${esc(config.github)}">GitHub ${arrow}</a></span></footer>
</body>
</html>`;
}

async function page(url, options) {
  const destination = url.endsWith('.html') ? path.join(out, url.slice(1)) : path.join(out, url.slice(1), 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, shell({ ...options, url }));
  if (url !== '/404.html') routes.push(url);
}

function projectCard(project, index) {
  return `<a class="project-card" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(project.name)}，在 GitHub 新窗口打开">
    <div class="card-meta"><span>${String(index + 1).padStart(2, '0')} / ${esc(project.category)}</span>${arrow}</div>
    <h3>${esc(project.name)}</h3><p>${esc(project.description)}</p><span class="language">${esc(project.language)}</span>
  </a>`;
}

function sectionHead(number, title, href, label) {
  return `<div class="section-heading"><h2><span class="section-number">${number}</span>${title}</h2>${href ? `<a class="text-link" href="${href}">${label} <span aria-hidden="true">→</span></a>` : ''}</div>`;
}

function row(post, numbered = false) {
  return `<a class="post-row" href="${post.url}"><div class="post-row-content">${numbered ? `<span class="chapter-number">${String(post.order).padStart(2,'0')}</span>` : ''}<div><h3>${esc(post.title)}</h3>${post.summary ? `<p>${esc(post.summary)}</p>` : ''}</div></div><div class="post-row-meta"><time datetime="${post.date}">${post.date.replaceAll('-', '.')}</time><span aria-hidden="true">→</span></div></a>`;
}

function empty(label, text) {
  return `<div class="empty-state"><span class="empty-rule" aria-hidden="true"></span><p>${label}</p><span>${text}</span></div>`;
}

function heading(kicker, title, text) {
  return `<div class="page-heading"><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="page-description">${text}</p></div>`;
}

// Delete only this project's generated output; author content lives outside dist.
if (out !== path.join(root, 'dist') || path.dirname(out) !== root) throw new Error('Unsafe output directory');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile('assets/style.css', path.join(out, 'style.css'));
await copyFile('assets/favicon.svg', path.join(out, 'favicon.svg'));
await writeFile(path.join(out, '.nojekyll'), '');
await mkdir(path.join(out, 'admin'), { recursive: true });
await copyFile('admin/index.html', path.join(out, 'admin/index.html'));
await copyFile('admin/admin.css', path.join(out, 'admin/admin.css'));
await build({ absWorkingDir: root, entryPoints: [path.join(root,'admin/main.js')], tsconfigRaw: {}, outdir: path.join(out,'admin'), entryNames: 'admin', chunkNames: 'chunks/[name]-[hash]', bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['es2022'], minify: true, sourcemap: false, legalComments: 'eof' });

await page('/', { active: 'home', content: `
  <section class="home-intro" aria-labelledby="home-title">
    <div><p class="eyebrow"><span class="small-line" aria-hidden="true"></span> ${esc(config.name)} 的个人博客</p><h1 id="home-title">写代码，<br>也写<span class="accent-word">故事</span>。</h1><p class="intro-description">一些做过的项目，一些沿途的想法。<br>还有一些，只存在于文字里的世界。</p></div>
    <div class="intro-aside" aria-hidden="true"><span>CODE</span><span>NOTES</span><span>STORIES</span><span class="aside-line"></span><span class="aside-caption">思考 · 记录 · 创作</span></div>
  </section>
  <section class="home-projects" aria-labelledby="projects-heading">
    <div class="section-heading"><h2 id="projects-heading"><span class="section-number">01</span>项目</h2><a class="text-link" href="/projects/">全部项目 <span aria-hidden="true">→</span></a></div>
    <div class="project-grid">${projects.slice(0, 4).map(projectCard).join('')}</div>
  </section>
  <section class="home-writing" aria-label="文字作品">
    <div class="writing-column">${sectionHead('02', '随笔', '/essays/', '随意翻翻')}${essays.length ? essays.slice(0,3).map(p => row(p)).join('') : `<a class="writing-empty" href="/essays/"><span class="writing-category">日常 · 想法 · 片刻</span><p>把想法留在纸上。</p><span class="quiet-note">还没有公开的随笔</span></a>`}</div>
    <div class="writing-column">${sectionHead('03', '小说', '/fiction/', '进入书架')}${fiction.length ? fiction.slice(0,3).map(p => row(p)).join('') : `<a class="writing-empty" href="/fiction/"><span class="writing-category">短篇 · 长篇 · 未完待续</span><p>另一种生活，在文字里。</p><span class="quiet-note">还没有公开的小说</span></a>`}</div>
  </section>` });

await page('/projects/', { title: '项目', active: 'projects', content: `${heading('01 / PROJECTS', '动手做过的事。', '从一个想法开始，在代码里慢慢成形。')}<div class="listing-bar"><span>项目选集</span><span>${String(projects.length).padStart(2,'0')} 个项目</span></div><div class="project-grid project-page-grid">${projects.map(projectCard).join('')}</div><p class="end-note">更多代码，留在 <a href="${esc(config.github)}?tab=repositories" target="_blank" rel="noopener noreferrer">GitHub ${arrow}</a>。</p>` });

await page('/essays/', { title: '随笔', active: 'essays', content: `${heading('02 / NOTES', '想法的落脚处。', '日常里的片刻，值得记下的念头。')}<div class="listing-bar"><span>全部随笔</span><span>${String(essays.length).padStart(2,'0')} 篇</span></div>${essays.length ? `<div class="post-list">${essays.map(p => row(p)).join('')}</div>` : empty('第一篇，留待落笔。', '这里还没有公开的随笔。')}` });

const singleStories = fiction.filter(p => !p.series);
await page('/fiction/', { title: '小说', active: 'fiction', content: `${heading('03 / STORIES', '文字里的另一种生活。', '短篇与长篇，已经写下的，和未完待续的。')}<div class="listing-bar"><span>书架</span><span>${String(collections.length + singleStories.length).padStart(2,'0')} 部作品</span></div>${fiction.length ? `<div class="book-list">${collections.map(book => `<a class="book-row" href="${book.url}"><div><span class="writing-category">章节小说 · ${book.chapters.length} 章</span><h2>${esc(book.name)}</h2></div><span aria-hidden="true">→</span></a>`).join('')}${singleStories.map(p => row(p)).join('')}</div>` : empty('故事还未开始。', '这里还没有公开的小说。')}` });

for (const book of collections) {
  await page(book.url, { title: book.name, active: 'fiction', content: `<a class="back-link" href="/fiction/">← 返回书架</a>${heading('STORIES / 章节目录', esc(book.name), `${book.chapters.length} 章`)}<div class="post-list">${book.chapters.map(p => row(p, true)).join('')}</div>` });
}

for (const post of [...essays, ...fiction]) {
  const book = post.series ? collections.find(b => b.name === post.series) : undefined;
  const index = book ? book.chapters.findIndex(p => p.slug === post.slug) : -1;
  const prev = book?.chapters[index - 1];
  const next = book?.chapters[index + 1];
  const backUrl = book?.url || `/${post.type}/`;
  const backLabel = book ? book.name + ' · 目录' : post.type === 'essays' ? '全部随笔' : '返回书架';
  await page(post.url, { title: post.title, description: post.summary || config.description, active: post.type, article: true, content: `
    <a class="back-link" href="${backUrl}">← ${esc(backLabel)}</a>
    <article><header class="article-header"><p class="eyebrow">${post.type === 'essays' ? '随笔 / NOTES' : '小说 / STORIES'}</p><h1>${esc(post.title)}</h1><div class="article-meta"><time datetime="${post.date}">${post.date.replaceAll('-','.')}</time><span>约 ${post.minutes} 分钟</span></div>${post.summary ? `<p class="article-summary">${esc(post.summary)}</p>` : ''}</header><div class="prose">${renderContent(post.content)}</div><div class="article-end" aria-hidden="true">— ${book ? '本章完' : '完'} —</div></article>
    ${book ? `<nav class="chapter-nav" aria-label="章节导航">${prev ? `<a href="${prev.url}"><span>← 上一章</span><strong>${esc(prev.title)}</strong></a>` : '<div></div>'}${next ? `<a class="next-chapter" href="${next.url}"><span>下一章 →</span><strong>${esc(next.title)}</strong></a>` : `<a class="next-chapter" href="${book.url}"><span>返回目录 →</span><strong>${esc(book.name)}</strong></a>`}</nav>` : `<a class="text-link article-back" href="${backUrl}">← ${esc(backLabel)}</a>`}` });
}

await page('/404.html', { title: '页面未找到', active: '', content: `${heading('404 / NOT FOUND', '这一页，暂时没有故事。', '链接可能有误，也可能这篇作品已经搬走。')}<a class="button-link" href="/">回到首页 <span aria-hidden="true">→</span></a>` });
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(url => `<url><loc>${esc(config.url + url)}</loc></url>`).join('')}</urlset>`);
console.log(`Built ${routes.length + 1} pages; ${projects.length} projects, ${essays.length} essays, ${fiction.length} fiction chapters. Drafts and examples are excluded.`);
