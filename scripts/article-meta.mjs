import { execFileSync } from 'node:child_process';

export function calendarDate(value, label = '日期') {
  const date = value instanceof Date ? value.toISOString().slice(0,10) : String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) {
    throw new Error(`${label}应为有效的 YYYY-MM-DD 日期。`);
  }
  return date;
}

export function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

export function firstUploadDate(filename, cwd = process.cwd()) {
  try {
    // Follow renames and retain the first upload when the body is replaced.
    const history = execFileSync('git', ['log','--follow','--format=%cI','--',filename], {cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split('\n').filter(Boolean);
    if (history.length) return localDate(history.at(-1));
  } catch { /* An uncommitted local preview uses today's date. */ }
  return localDate();
}

export function articleDates(data, metadata, uploadedAt) {
  const value = Object.hasOwn(metadata, 'writtenAt') ? metadata.writtenAt : (data.writtenAt ?? data.date);
  return {
    uploadedAt: calendarDate(uploadedAt, '上传时间'),
    writtenAt: calendarDate(value ?? uploadedAt, '写作时间'),
  };
}

const paragraphText = element => element.type === 'text' ? element.value : (element.children || []).map(paragraphText).join('');
export function manuscriptParagraph(paragraph) {
  const text = paragraphText(paragraph).trim();
  // Recognize existing centered chapter numbers, never invent or number sections.
  if (paragraph.alignment === 'center' && /^(?:[（(][一二三四五六七八九十百零〇两\d]+[）)]|[一二三四五六七八九十百零〇两]+|第[一二三四五六七八九十百零〇两\d]+[章节回](?:\s+.{1,40})?)$/.test(text)) {
    return {...paragraph, styleId:'Heading2', styleName:'heading 2'};
  }
  return paragraph;
}
