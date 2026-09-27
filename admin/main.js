import { readMarkdown, toMarkdown, validate, importFile, previewHTML, MAX_CONTENT } from './content.js';

const OWNER = 'fen-dada';
const REPOSITORY = 'fen-dada.github.io';
const REPO = `/repos/${OWNER}/${REPOSITORY}`;
const BRANCH = 'main';
const DRAFT_KEY = 'fen-dada-writing-draft-v1';
const $ = id => document.getElementById(id);
const fields = ['title','kind','date','summary','series','order','body'];
const state = { token: '', path: null, sha: null, extra: {}, entries: [], dirty: false, busy: false, commit: null, publishedUrl: null, poll: null, checks: 0 };
let draftTimer;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const form = () => Object.fromEntries(fields.map(id => [id,$(id).value]));

function message(text, error = false) { $('notice').textContent = text; $('notice').dataset.error = String(error); $('notice').hidden = false; }
function busy(value) {
  state.busy = value;
  for (const id of ['publish','new-post','import-button','download','connect','disconnect','refresh']) $(id).disabled = value || (id === 'refresh' && !state.token);
  for (const id of fields) $(id).disabled = value || (id === 'kind' && Boolean(state.path));
  $('publish').textContent = value ? '处理中…' : state.path ? '发布修改 →' : '发布作品 →';
}
function syncKind() { $('series-fields').hidden = $('kind').value !== 'fiction'; }
function wordCount() { return $('body').value.replace(/!\[[^\]]*\]\(data:[^)]+\)/g,'').replace(/<[^>]*>/g,'').replace(/\s/g,'').length; }
function updateEditor() {
  syncKind(); $('word-count').textContent = `${wordCount().toLocaleString()} 字`;
  $('edit-state').textContent = state.path ? '修改已有作品' : '新作品';
  $('publish').textContent = state.path ? '发布修改 →' : '发布作品 →';
  $('kind').disabled = Boolean(state.path);
  if (!$('preview-panel').hidden) renderPreview();
}
function renderPreview() { $('preview-title').textContent = $('title').value || '未命名作品'; $('preview-body').innerHTML = previewHTML($('body').value || '正文预览会显示在这里。'); }
function view(mode) {
  const preview = mode === 'preview';
  $('preview-panel').hidden = !preview; $('edit-panel').hidden = preview;
  for (const [id,selected] of [['preview-tab',preview],['edit-tab',!preview]]) { $(id).setAttribute('aria-selected',String(selected)); $(id).tabIndex = selected ? 0 : -1; }
  if (preview) renderPreview();
}
function saveDraft() {
  clearTimeout(draftTimer);
  if (!state.dirty) return;
  try {
    localStorage.setItem(DRAFT_KEY,JSON.stringify({ form: form(), path: state.path, sha: state.sha, extra: state.extra, saved: Date.now() }));
    $('draft-status').textContent = '草稿已保存在本机';
  } catch { $('draft-status').textContent = '本机保存失败，请下载备份'; }
}
function changed() { state.dirty = true; updateEditor(); $('draft-status').textContent = '保存中…'; clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft,400); }
function mayLeave() { return !state.dirty || window.confirm('当前编辑尚未发布。确定切换吗？建议先下载备份。'); }
function fill(values, record = {}) {
  clearTimeout(draftTimer);
  clearTimeout(state.poll); state.commit = null;
  for (const id of fields) $(id).value = values[id] ?? (id === 'date' ? today() : id === 'kind' ? 'essays' : '');
  state.path = record.path || null; state.sha = record.sha || null; state.extra = record.extra || {}; state.dirty = false;
  $('draft-status').textContent = state.path ? '已读取当前版本' : '未保存';
  $('deployment').hidden = true; $('restore-bar').hidden = true;
  updateEditor(); view('edit'); markSelected();
}
function markSelected() { for (const entry of $('entries').children) { if (entry.dataset.path === state.path) entry.setAttribute('aria-current','true'); else entry.removeAttribute('aria-current'); } }

async function api(path, { method = 'GET', body, auth = true } = {}) {
  if (auth && !state.token) throw new Error('请先连接 GitHub。');
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (auth) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try { response = await fetch(`https://api.github.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(30000), credentials: 'omit', redirect: 'error' }); }
  catch { throw new Error(method === 'PUT' ? '没有收到 GitHub 的提交结果。请先刷新作品列表确认是否已保存，再重试，避免重复发布。' : '暂时无法连接 GitHub，请检查网络后重试。'); }
  if (!response.ok) {
    const errors = { 401:'令牌无效或已过期，请退出后重新连接。',403:'GitHub 拒绝了请求，请检查令牌的博客仓库 Contents 读写权限，或稍后重试。',404:'未找到文件或仓库，请检查访问令牌是否选中了 fen-dada.github.io。',409:'这篇作品已被其他操作修改。当前编辑仍保留，请下载备份，再刷新并打开最新版本。',422:'GitHub 未接受本次提交，文件可能已存在。请刷新作品列表后重试。' };
    throw new Error(errors[response.status] || `GitHub 暂时无法完成请求（${response.status}），请稍后重试。`);
  }
  return response.status === 204 ? null : response.json();
}
function fromBase64(content) { const raw = atob(content.replace(/\s/g,'')); return new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0))); }
function toBase64(content) { const bytes = new TextEncoder().encode(content); let raw = ''; for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768)); return btoa(raw); }
function contentPath(path) { return `${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`; }
async function readEntry(path) {
  const data = await api(`${contentPath(path)}?ref=${BRANCH}`);
  if (data.encoding !== 'base64' || data.size > 1000000) throw new Error('这份作品较大，暂时不能在写作台中打开，请在 GitHub 中处理。');
  const parsed = readMarkdown(fromBase64(data.content));
  return { path, sha: data.sha, ...parsed };
}
async function library() {
  $('library-note').textContent = '正在读取作品…'; $('library-note').hidden = false;
  const tree = await api(`${REPO}/git/trees/${BRANCH}?recursive=1`);
  if (tree.truncated) throw new Error('仓库目录过大，无法完整读取。请在 GitHub 中管理本次作品。');
  const files = tree.tree.filter(file => file.type === 'blob' && /^content\/(essays|fiction)\/[a-z0-9][a-z0-9_-]*\.md$/.test(file.path));
  const entries = [];
  let next = 0;
  await Promise.all(Array.from({ length:Math.min(4,files.length) },async()=>{
    while(next<files.length) { const file = files[next++]; const cached = state.entries.find(e=>e.path===file.path&&e.sha===file.sha); entries.push(cached || await readEntry(file.path)); }
  }));
  state.entries = entries.sort((a,b)=>String(b.metadata.date || '').localeCompare(String(a.metadata.date || '')));
  $('entries').replaceChildren();
  for(const entry of state.entries) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'entry'; button.dataset.path = entry.path;
    button.append(document.createTextNode(String(entry.metadata.title || entry.path.split('/').pop())));
    const detail = document.createElement('span'); detail.textContent = `${entry.path.includes('/essays/')?'随笔':'小说'} · ${entry.metadata.draft === true ? '未公开' : '已提交'} · ${entry.metadata.date || ''}`; button.append(detail);
    button.addEventListener('click',()=>openEntry(entry.path)); $('entries').append(button);
  }
  $('library-note').textContent = entries.length ? `${entries.length} 篇作品` : '还没有作品，从右侧导入第一篇吧。';
  markSelected();
}
async function openEntry(path) {
  if(state.busy||!mayLeave())return;
  busy(true);
  try{const entry=await readEntry(path);const m=entry.metadata;fill({title:m.title,kind:path.includes('/fiction/')?'fiction':'essays',date:String(m.date||today()),summary:m.summary,series:m.series,order:m.order,body:entry.body},{...entry,extra:m});message('已打开作品。修改后点击“发布修改”即可更新原页面。');}
  catch(error){message(error.message,true);}finally{busy(false);}
}

function openAuth() { $('auth-error').hidden=true; $('auth-dialog').showModal(); $('token').focus(); }
$('connect').addEventListener('click',openAuth);
$('close-auth').addEventListener('click',()=>{if(!$('auth-submit').disabled)$('auth-dialog').close();});
$('auth-dialog').addEventListener('close',()=>{$('token').value='';});
$('auth-dialog').addEventListener('cancel',event=>{if($('auth-submit').disabled)event.preventDefault();});
$('auth-form').addEventListener('submit',async event=>{
  event.preventDefault();
  $('auth-submit').disabled=true; $('auth-submit').textContent='正在连接…'; $('auth-error').hidden=true;
  state.token=$('token').value.trim(); $('token').value='';
  try{
    const user=await api('/user');
    if(user.login!==OWNER)throw new Error('这个写作台只允许 fen-dada 连接，请使用博客所有者的访问令牌。');
    const repo=await api(REPO);
    if(!repo.permissions?.push)throw new Error('当前账号不能写入这个博客仓库。');
    busy(true);await library();
    $('auth-dialog').close();$('connect').hidden=true;$('disconnect').hidden=false;
    $('connection-status').textContent='已连接 fen-dada · 可以发布作品';
    message('已连接。你可以导入 Word 文档，也可以从左侧打开已有作品。');
  }catch(error){state.token='';$('auth-error').textContent=error.message;$('auth-error').hidden=false;}
  finally{busy(false);$('auth-submit').disabled=false;$('auth-submit').textContent='连接博客';}
});
$('disconnect').addEventListener('click',()=>{
  state.token='';state.entries=[];$('entries').replaceChildren();$('disconnect').hidden=true;$('connect').hidden=false;$('refresh').disabled=true;
  $('connection-status').textContent='已退出连接，编辑内容仍保留。';$('library-note').textContent='重新连接后可以查看已有作品。';message('已退出连接，当前页面中的访问令牌已清除。');
});
$('refresh').addEventListener('click',async()=>{if(state.busy)return;busy(true);try{await library();message('作品列表已更新，当前编辑保留。');}catch(error){message(error.message,true);}finally{busy(false);}});
$('new-post').addEventListener('click',()=>{if(state.busy||!mayLeave())return;fill({});$('title').focus();message('已新建作品，可以导入 Word 文档或直接写作。');});
$('editor-form').addEventListener('input',changed);
$('kind').addEventListener('change',changed);
$('edit-tab').addEventListener('click',()=>view('edit'));
$('preview-tab').addEventListener('click',()=>view('preview'));
for(const id of ['edit-tab','preview-tab'])$(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'edit':event.key==='End'?'preview':id==='edit-tab'?'preview':'edit';view(next);$(`${next}-tab`).focus();}});
$('import-button').addEventListener('click',()=>{if(!state.busy)$('import-file').click();});
$('import-file').addEventListener('change',async()=>{
  const file=$('import-file').files[0];$('import-file').value='';if(!file||state.busy||!mayLeave())return;
  const kind=$('kind').value;busy(true);message('正在导入文档，请稍候…');
  try{
    const imported=await importFile(file);const m=imported.metadata;
    fill({title:imported.title,kind:m.series?'fiction':kind,date:typeof m.date==='string'?m.date:today(),summary:typeof m.summary==='string'?m.summary:'',series:typeof m.series==='string'?m.series:'',order:m.order||'',body:imported.body});
    changed();saveDraft();view('preview');
    message(`已导入「${imported.title}」${imported.imageCount?`，保留 ${imported.imageCount} 张图片`:''}。请检查预览并选择作品类型，再发布。${imported.skippedImages?`有 ${imported.skippedImages} 张特殊格式图片无法转换，未导入。`:''}`);
  }catch(error){message(error.message||'无法读取这个文档，请用 Word 重新另存为 .docx 后重试。',true);}finally{busy(false);}
});
$('restore').addEventListener('click',()=>{
  if(!mayLeave())return;
  try{const saved=JSON.parse(localStorage.getItem(DRAFT_KEY));if(!saved?.form)throw new Error();fill(saved.form,saved);changed();saveDraft();message('本机草稿已恢复，尚未发布。');}
  catch{message('无法恢复这份草稿。',true);}
});
$('download').addEventListener('click',()=>{
  const values=form();if(!values.body.trim()){message('先写一些内容或导入文档，再下载备份。',true);return;}
  const text=toMarkdown(values,state.extra);const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=(values.title||'未命名作品').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-')+'.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已下载 Markdown 备份，正文和导入图片都包含在文件中。');
});

async function checkDeployment() {
  clearTimeout(state.poll);if(!state.commit)return;
  const commit = state.commit;
  $('check-deployment').disabled=true;
  try{
    const result=await api(`${REPO}/actions/workflows/deploy.yml/runs?head_sha=${commit}&per_page=5`,{auth:false});
    if (state.commit !== commit) return;
    const run=result.workflow_runs.find(r=>r.head_sha===commit);
    if(run?.html_url)$('workflow-link').href=run.html_url;
    if(run?.status==='completed'){
      if(run.conclusion==='success'){$('deployment-text').textContent='作品已上线。';$('view-article').href=state.publishedUrl;$('view-article').hidden=false;}
      else{$('deployment-text').textContent='作品已保存，但网站发布失败。请查看发布进度；你的正文仍在仓库中。';}
      return;
    }
    $('deployment-text').textContent='作品已保存，网站正在更新。通常需要一两分钟。';
  }catch{$('deployment-text').textContent='作品已保存，暂时无法读取上线状态。可以稍后检查，或打开发布进度。';}
  finally{$('check-deployment').disabled=false;}
  if(++state.checks<20)state.poll=setTimeout(checkDeployment,15000);
}
$('check-deployment').addEventListener('click',()=>{state.checks=0;checkDeployment();});
$('editor-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.busy)return;
  // Hidden textarea remains required; show it before native invalid-field focus.
  const values=form();
  try{validate(values);}catch(error){message(error.message,true);return;}
  if(!state.token){saveDraft();message('内容已保留，请先连接 GitHub，再点击发布。');openAuth();return;}
  const source=toMarkdown(values,state.extra);
  if(new TextEncoder().encode(source).length>MAX_CONTENT){message('内容超过 900 KB，请拆分章节或压缩图片。',true);return;}
  if(!window.confirm(`确认将「${values.title.trim()}」${state.path?'的修改':''}公开发布到博客？正文和图片会公开。`))return;
  busy(true);saveDraft();message('正在保存作品，请稍候…');
  try{
    await library();
    if(values.kind==='fiction'&&values.series.trim()){
      const conflict=state.entries.find(e=>e.path!==state.path&&e.metadata.draft!==true&&e.metadata.series===values.series.trim()&&Number(e.metadata.order)===Number(values.order));
      if(conflict)throw new Error(`「${values.series.trim()}」已存在第 ${values.order} 章，请修改章节顺序。`);
    }
    let filename=state.path;
    if(filename){const latest=state.entries.find(e=>e.path===filename);if(!latest||latest.sha!==state.sha)throw new Error('作品已有新版本。请先下载当前编辑的备份，再刷新并打开最新作品，避免覆盖其他修改。');}
    else filename=`content/${values.kind}/${values.kind==='essays'?'note':'story'}-${values.date.replaceAll('-','')}-${crypto.randomUUID().slice(0,8)}.md`;
    const body={message:`${state.path?'Update':'Publish'} ${values.kind}: ${values.title.trim()}`,content:toBase64(source),branch:BRANCH};if(state.sha)body.sha=state.sha;
    const result=await api(contentPath(filename),{method:'PUT',body});
    state.path=filename;state.sha=result.content.sha;state.commit=result.commit.sha;state.dirty=false;
    state.publishedUrl=`https://${OWNER}.github.io/${values.kind}/${filename.split('/').pop().slice(0,-3)}/`;
    clearTimeout(draftTimer);try{localStorage.removeItem(DRAFT_KEY);}catch{}
    $('draft-status').textContent='作品已提交';updateEditor();$('deployment').hidden=false;$('view-article').hidden=true;
    $('deployment-text').textContent='作品已保存，正在等待网站更新。';$('workflow-link').href=`https://github.com/${OWNER}/${REPOSITORY}/actions/workflows/deploy.yml`;
    message('已提交发布。下方会显示上线进度，正文不会因关闭页面而丢失。');
    state.checks=0;checkDeployment();
    try{await library();}catch{message('作品已保存，但列表刷新失败。可以稍后点击“刷新”。');}
  }catch(error){message(error.message,true);}
  finally{busy(false);}
});
window.addEventListener('beforeunload',event=>{if(state.dirty){saveDraft();event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();});
fill({});
try{$('restore-bar').hidden=!localStorage.getItem(DRAFT_KEY);}catch{}
