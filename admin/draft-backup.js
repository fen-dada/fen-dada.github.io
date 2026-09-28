const status = document.getElementById('status');
const button = document.getElementById('download');
try {
  const saved = JSON.parse(localStorage.getItem('fen-dada-writing-draft-v1'));
  if (!saved?.form?.body) status.textContent = '这个浏览器中没有找到旧编辑器保存的草稿。';
  else {
    const f = saved.form;
    status.textContent = `找到草稿：${f.title || '未命名作品'}。下载后可以上传到新的发布入口。`;
    button.hidden = false;
    button.addEventListener('click', () => {
      const metadata = [`title: ${JSON.stringify(f.title || '未命名作品')}`,`date: ${JSON.stringify(f.date || new Date().toISOString().slice(0,10))}`,`summary: ${JSON.stringify(f.summary || '')}`];
      if (f.kind === 'fiction' && f.series) { metadata.push(`series: ${JSON.stringify(f.series)}`); metadata.push(`order: ${Number(f.order) || 1}`); }
      const content = `---\n${metadata.join('\n')}\n---\n\n${f.body}\n`;
      const url = URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));
      const a = document.createElement('a'); a.href = url; a.download = `${(f.title || '草稿').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-')}.md`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
} catch { status.textContent = '无法读取本机草稿。请确认使用了原来的浏览器，并允许读取浏览器存储。'; }
