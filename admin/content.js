import { load, dump, JSON_SCHEMA } from 'js-yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

export const MAX_CONTENT = 900000;
export const cleanHTML = html => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','blockquote','ul','ol','li','pre','code','a','img','hr','table','thead','tbody','tr','th','td','sup','sub'],
  ALLOWED_ATTR: ['href','src','alt','title','start','colspan','rowspan','id'],
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
});
export const previewHTML = text => cleanHTML(marked.parse(text));

export function readMarkdown(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return { metadata: {}, body: normalized.trim() };
  const metadata = load(match[1], { schema: JSON_SCHEMA }) || {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('文件开头的作品信息格式有误，请检查标题和日期。');
  return { metadata, body: normalized.slice(match[0].length).trim() };
}

export function toMarkdown(form, extra = {}) {
  const metadata = { ...extra, title: form.title.trim(), date: form.date, summary: form.summary.trim(), draft: false };
  delete metadata.series; delete metadata.order;
  if (form.kind === 'fiction' && form.series.trim()) {
    metadata.series = form.series.trim(); metadata.order = Number(form.order);
  }
  return `---\n${dump(metadata, { schema: JSON_SCHEMA, lineWidth: -1, noRefs: true, sortKeys: false })}---\n\n${form.body.trim()}\n`;
}

export function validate(form) {
  if (!form.title.trim()) throw new Error('请填写作品标题。');
  if (form.title.length > 200 || form.summary.length > 500 || form.series.length > 120) throw new Error('标题、简介或小说名称太长，请适当缩短。');
  if (!form.body.trim()) throw new Error('请先导入文档或填写正文。');
  if (!['essays','fiction'].includes(form.kind)) throw new Error('请选择作品类型。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(Date.parse(form.date)) || new Date(form.date).toISOString().slice(0,10) !== form.date) throw new Error('请填写有效的发布日期。');
  if (form.kind === 'fiction' && form.series.trim() && (!Number.isInteger(Number(form.order)) || Number(form.order) < 1)) throw new Error('连载章节需要填写从 1 开始的章节顺序。');
  if (new TextEncoder().encode(toMarkdown(form)).length > MAX_CONTENT) throw new Error('转换后的内容超过 900 KB。请拆分长篇章节，或压缩文档中的大图片后再导入。');
}

function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

export async function importFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['docx','md','markdown','txt'].includes(ext)) throw new Error('请选择 .docx、.md 或 .txt 文件；旧版 .doc 请先另存为 .docx。');
  if (file.size > 16 * 1024 * 1024) throw new Error('文件超过 16 MB，请先拆分章节或压缩图片。');
  let metadata = {}, body = '', imageCount = 0, skippedImages = 0;
  let title = file.name.replace(/\.[^.]+$/, '');
  const buffer = await file.arrayBuffer();
  if (ext === 'docx') {
    const module = await import('mammoth/mammoth.browser.js');
    const mammoth = module.default || module;
    const converted = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(async image => {
        if (!['image/png','image/jpeg','image/gif','image/webp'].includes(image.contentType)) { skippedImages++; return { src: '' }; }
        imageCount++;
        return { src: `data:${image.contentType};base64,${await image.read('base64')}` };
      }),
    });
    const doc = new DOMParser().parseFromString(cleanHTML(converted.value), 'text/html');
    const first = doc.body.firstElementChild;
    if (first?.tagName === 'H1' && first.textContent.trim()) { title = first.textContent.trim(); first.remove(); }
    for (const img of doc.querySelectorAll('img')) if (!img.getAttribute('src')) img.remove();
    const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    turndown.keep(['table','thead','tbody','tr','th','td','sup','sub']);
    body = turndown.turndown(doc.body.innerHTML);
  } else {
    const text = decodeText(buffer);
    if (ext === 'txt') body = text.replace(/\r\n/g, '\n').trim();
    else ({ metadata, body } = readMarkdown(text));
    if (typeof metadata.title === 'string') title = metadata.title;
  }
  if (!body.trim()) throw new Error('没有读取到正文。扫描图片型 Word 文档需要先转为可编辑文字。');
  if (new TextEncoder().encode(body).length > MAX_CONTENT - 2000) throw new Error('文档转换后超过 900 KB，请拆分章节或压缩图片后重试。');
  return { title, metadata, body, imageCount, skippedImages };
}
