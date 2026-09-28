import { readFile, readdir, mkdir, writeFile, copyFile, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import mammoth from 'mammoth';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const root = process.cwd();
const out = path.join(root, 'dist');
const config = JSON.parse(await readFile('site.config.json', 'utf8'));
const projects = JSON.parse(await readFile('content/projects.json', 'utf8'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const hash = value => createHash('sha256').update(value).digest('hex');
const routes = [];
const media = new Map();
const warnings = [];
const clean = html => sanitizeHtml(html, {
  allowedTags: ['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','blockquote','ul','ol','li','pre','code','a','img','hr','table','thead','tbody','tr','th','td','sup','sub'],
  allowedAttributes: { a:['href','title','id'], img:['src','alt','title'], ol:['start'], th:['colspan','rowspan'], td:['colspan','rowspan'], code:['class'] },
  allowedSchemes:['http','https','mailto'], allowedSchemesByTag:{img:['https','http','data']}, allowProtocolRelative:false,
});

async function walk(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory,relative),{withFileTypes:true})) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name.startsWith('~$')) continue;
    const filename = path.posix.join(relative,entry.name);
    if (entry.isDirectory()) files.push(...await walk(directory,filename));
    else if (entry.isFile() && /\.(md|txt|docx)$/i.test(entry.name)) files.push(filename);
  }
  return files.sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
}

function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  try { return new TextDecoder('utf-8',{fatal:true}).decode(buffer); }
  catch { return new TextDecoder('gb18030').decode(buffer); }
}

async function fileDate(filename) {
  try {
    const date = execFileSync('git',['log','-1','--format=%cs','--',filename],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch { /* Uncommitted files use their filesystem date for local preview. */ }
  return (await stat(filename)).mtime.toISOString().slice(0,10);
}

async function posts(type) {
  const directory = `content/${type}`;
  const files = await walk(directory);
  const list = [];
  for (const relative of files) {
    const filename = `${directory}/${relative}`;
    const extension = path.extname(relative).toLowerCase();
    const basename = path.basename(relative,path.extname(relative));
    const buffer = await readFile(filename);
    if (buffer.length > 25 * 1024 * 1024) throw new Error(`${filename}: 文件超过 25 MB，请拆分章节或压缩图片。`);
    let data = {}, content = '', html = '';
    if (extension === '.md') {
      ({data,content} = matter(decodeText(buffer)));
      if (data.draft === true) continue;
      html = clean(marked.parse(content));
    } else if (extension === '.txt') {
      content = decodeText(buffer).trim();
      html = content.split(/\r?\n\s*\r?\n/).map(p=>`<p>${esc(p).replace(/\r?\n/g,'<br>')}</p>`).join('\n');
    } else {
      const result = await mammoth.convertToHtml({buffer},{
        externalFileAccess:false,
        convertImage:mammoth.images.imgElement(async image=>{
          const ext = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[image.contentType];
          if (!ext) { warnings.push(`${filename}: 未转换的图片格式 ${image.contentType}`); return {src:'',alt:'图片格式不受支持'}; }
          const bytes = await image.read();
          const asset = `${hash(bytes)}.${ext}`;
          media.set(asset,bytes);
          return {src:`/media/${asset}`};
        }),
      });
      html = clean(result.value);
      html = html.replace(/^<h1>([\s\S]*?)<\/h1>/, (whole, text)=>text === esc(basename) ? '' : whole);
      content = html.replace(/<[^>]+>/g,' ').trim();
      for (const message of result.messages) warnings.push(`${filename}: ${message.message}`);
    }
    if (data.draft !== undefined && data.draft !== false) throw new Error(`${filename}: draft 应为 true 或 false。`);
    const title = data.title ?? basename;
    if (typeof title !== 'string' || !title.trim()) throw new Error(`${filename}: 缺少标题。`);
    if (!content.trim() && !/<img\b/.test(html)) throw new Error(`${filename}: 没有读取到正文。`);
    const date = data.date instanceof Date ? data.date.toISOString().slice(0,10) : String(data.date ?? await fileDate(filename));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw new Error(`${filename}: 日期应为 YYYY-MM-DD。`);
    const folder = path.posix.dirname(relative);
    const series = data.series ?? (type === 'fiction' && folder !== '.' ? folder : undefined);
    let order = data.order;
    if (series) {
      if (typeof series !== 'string' || !series.trim()) throw new Error(`${filename}: 小说名称不能为空。`);
      if (order === undefined) {
        const number = basename.match(/^(?:第\s*)?(\d+)(?:[章节回._\s-]|$)/);
        if (!number) throw new Error(`${filename}: 连载章节的文件名请以数字开头，例如 01 开篇.docx。`);
        order = Number(number[1]);
      }
      if (!Number.isInteger(order) || order < 1) throw new Error(`${filename}: 章节序号应为正整数。`);
    }
    const slug = extension === '.md' && folder === '.' && /^[a-z0-9][a-z0-9_-]*$/.test(basename) ? basename : `${extension.slice(1)}-${hash(relative).slice(0,16)}`;
    list.push({title:title.trim(),date,summary:typeof data.summary==='string'?data.summary:'',series,order,html,type,slug,url:`/${type}/${slug}/`});
  }
  if (new Set(list.map(p=>p.slug)).size!==list.length) throw new Error(`${type}: 文章地址重复。`);
  return list.sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'zh-CN',{numeric:true}));
}

const essays = await posts('essays');
const fiction = await posts('fiction');
const collections = [...new Set(fiction.filter(p=>p.series).map(p=>p.series))].map(name=>{
  const chapters=fiction.filter(p=>p.series===name).sort((a,b)=>a.order-b.order);
  if(new Set(chapters.map(p=>p.order)).size!==chapters.length)throw new Error(`${name}: 章节序号重复。`);
  return {name,chapters,url:`/fiction/series/${hash(name).slice(0,12)}/`};
});

function shell({title,description=config.description,url,active,content,article=false,noindex=false}) {
  const nav=[['/','首页','home'],['/essays/','随笔','essays'],['/fiction/','小说','fiction'],['/projects/','项目','projects']];
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title?`${title} - ${config.name}`:config.name)}</title>
<meta name="description" content="${esc(description)}">${noindex?'<meta name="robots" content="noindex, nofollow">':''}
<link rel="canonical" href="${esc(config.url+url)}"><meta name="theme-color" content="#ffffff">
<meta property="og:type" content="${article?'article':'website'}"><meta property="og:title" content="${esc(title||config.name)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(config.url+url)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="stylesheet" href="/style.css">
</head><body>
<a class="skip-link" href="#main">跳到正文</a>
<header class="wrap"><a class="site-name" href="/">${esc(config.name)}</a><nav aria-label="主导航">${nav.map(([href,label,key])=>`<a href="${href}"${key===active?' aria-current="page"':''}>${label}</a>`).join('')}</nav></header>
<main id="main" class="wrap${article?' article':''}">${content}</main>
<footer class="wrap"><a href="${esc(config.github)}">GitHub</a><a href="/admin/">管理</a></footer>
</body></html>`;
}

async function page(url,options) {
  const destination=url.endsWith('.html')?path.join(out,url.slice(1)):path.join(out,url.slice(1),'index.html');
  await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,shell({...options,url}));
  if(url!=='/404.html'&&!options.noindex)routes.push(url);
}

function rows(items) {
  return `<ul class="post-list">${items.map(p=>`<li><a href="${p.url}">${esc(p.title)}</a><time datetime="${p.date}">${p.date}</time></li>`).join('')}</ul>`;
}
const empty = text=>`<p class="muted">${text}</p>`;
const projectList = items=>`<ul class="projects">${items.map(p=>`<li><a href="${esc(p.url)}">${esc(p.name)}</a><p>${esc(p.description)}</p></li>`).join('')}</ul>`;

if(path.dirname(out)!==root||path.basename(out)!=='dist')throw new Error('Unsafe output directory');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await copyFile('assets/style.css',path.join(out,'style.css'));
await copyFile('assets/favicon.svg',path.join(out,'favicon.svg'));
await writeFile(path.join(out,'.nojekyll'),'');
if(media.size){await mkdir(path.join(out,'media'),{recursive:true});for(const [filename,bytes] of media)await writeFile(path.join(out,'media',filename),bytes);}

await page('/',{active:'home',content:`<h1 class="sr-only">${esc(config.name)} 的个人网站</h1>
<section><h2><a href="/essays/">随笔</a></h2>${essays.length?rows(essays.slice(0,5)):empty('暂无文章。')}</section>
<section><h2><a href="/fiction/">小说</a></h2>${fiction.length?rows(fiction.slice(0,5)):empty('暂无作品。')}</section>
<section><h2><a href="/projects/">项目</a></h2>${projectList(projects)}</section>`});
await page('/essays/',{title:'随笔',active:'essays',content:`<h1>随笔</h1>${essays.length?rows(essays):empty('暂无文章。')}`});
await page('/projects/',{title:'项目',active:'projects',content:`<h1>项目</h1>${projectList(projects)}`});
const singles=fiction.filter(p=>!p.series);
await page('/fiction/',{title:'小说',active:'fiction',content:`<h1>小说</h1>${fiction.length?`${collections.map(book=>`<p class="book"><a href="${book.url}">${esc(book.name)}</a><span class="muted">${book.chapters.length} 章</span></p>`).join('')}${singles.length?rows(singles):''}`:empty('暂无作品。')}`});
for(const book of collections)await page(book.url,{title:book.name,active:'fiction',content:`<p class="back"><a href="/fiction/">返回小说目录</a></p><h1>${esc(book.name)}</h1><ol class="chapters">${book.chapters.map(p=>`<li><a href="${p.url}">${esc(p.title)}</a></li>`).join('')}</ol>`});
for(const post of [...essays,...fiction]){
  const book=post.series?collections.find(b=>b.name===post.series):null;
  const index=book?.chapters.findIndex(p=>p.slug===post.slug);
  const previous=book?.chapters[index-1],next=book?.chapters[index+1];
  await page(post.url,{title:post.title,description:post.summary||config.description,active:post.type,article:true,content:`
<p class="back"><a href="${book?.url||`/${post.type}/`}">${book?'返回章节目录':post.type==='essays'?'返回随笔':'返回小说'}</a></p>
<article><h1>${esc(post.title)}</h1><p class="date"><time datetime="${post.date}">${post.date}</time></p><div class="prose">${post.html}</div></article>
${book?`<nav class="chapter-nav" aria-label="章节导航">${previous?`<a href="${previous.url}">上一章：${esc(previous.title)}</a>`:'<span></span>'}${next?`<a href="${next.url}">下一章：${esc(next.title)}</a>`:`<a href="${book.url}">章节目录</a>`}</nav>`:''}`});
}
await page('/admin/',{title:'管理',active:'',noindex:true,content:`
<h1>上传文章</h1>
<p>用 <strong>fen-dada</strong> 登录 GitHub，选择要上传的文件，然后点击 <strong>Commit changes</strong>。网站会自动更新。</p>
<p class="upload-links"><a href="https://github.com/fen-dada/fen-dada.github.io/upload/main/content/essays">上传随笔</a><a href="https://github.com/fen-dada/fen-dada.github.io/upload/main/content/fiction">上传小说</a></p>
<p>支持 Word（.docx）、TXT 和 Markdown。Word 和 TXT 的文件名会作为文章标题。</p>
<h2>连载小说</h2><p>把章节放在以小说名称命名的文件夹里，文件名以序号开头，再将整个文件夹拖入小说上传页面。</p>
<pre class="example">小说名称/
  01 开篇.docx
  02 第二章.docx</pre>
<h2>修改和删除</h2><p>进入 <a href="https://github.com/fen-dada/fen-dada.github.io/tree/main/content/essays">随笔文件夹</a> 或 <a href="https://github.com/fen-dada/fen-dada.github.io/tree/main/content/fiction">小说文件夹</a>，用同名文件替换原稿，或者删除文件。提交后会自动更新。</p>
<p class="muted">目前只有你的账号有仓库写入权限，访客不能发布文章。上传的原文件也会保存在公开仓库中。</p>
<p class="small"><a href="https://github.com/fen-dada/fen-dada.github.io/actions/workflows/deploy.yml">查看发布状态</a> · <a href="/admin/draft-backup.html">取回旧编辑器的本机草稿</a></p>`});
await page('/404.html',{title:'页面不存在',active:'',content:'<h1>页面不存在</h1><p><a href="/">返回首页</a></p>'});
await mkdir(path.join(out,'admin'),{recursive:true});
await copyFile('admin/draft-backup.html',path.join(out,'admin/draft-backup.html'));
await copyFile('admin/draft-backup.js',path.join(out,'admin/draft-backup.js'));
await writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${config.url}/sitemap.xml\n`);
await writeFile(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(url=>`<url><loc>${esc(config.url+url)}</loc></url>`).join('')}</urlset>`);
for(const warning of warnings)console.warn(warning);
console.log(`Built ${routes.length+2} pages; ${projects.length} projects, ${essays.length} essays, ${fiction.length} fiction chapters, ${media.size} images.`);
