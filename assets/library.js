const library = document.querySelector('[data-library]');
if (library) {
  const search = library.querySelector('input[type="search"]');
  const sort = library.querySelector('select');
  const list = library.querySelector('.resource-list');
  const items = [...list.children];
  const filters = [...library.querySelectorAll('[data-filter]')];
  const views = [...library.querySelectorAll('[data-view]')];
  const empty = library.querySelector('[data-empty]');
  const emptyLabel = library.querySelector('[data-empty-label]');
  const initialEmpty = emptyLabel.textContent;
  const clear = library.querySelector('.clear-search');
  let category = 'all';

  function refresh() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const item of items) {
      item.hidden = !(category === 'all' || item.dataset.type === category) || !item.dataset.search.includes(query);
      if (!item.hidden) count++;
    }
    const ordered = [...items].sort((a, b) => {
      if (sort.value === 'name') return a.dataset.title.localeCompare(b.dataset.title, 'zh-CN', {numeric:true});
      if (sort.value === 'newest') return b.dataset.date.localeCompare(a.dataset.date) || Number(a.dataset.order) - Number(b.dataset.order);
      return Number(a.dataset.order) - Number(b.dataset.order);
    });
    for (const item of ordered) list.append(item);
    library.querySelector('.result-count').textContent = `${count} 项`;
    empty.hidden = count !== 0;
    library.querySelector('.table-heading').hidden = count === 0;
    emptyLabel.textContent = query || category !== 'all' ? '没有匹配的内容。' : initialEmpty;
    clear.hidden = !query && category === 'all';
  }

  search.addEventListener('input', refresh);
  sort.addEventListener('change', refresh);
  for (const button of filters) button.addEventListener('click', () => {
    category = button.dataset.filter;
    for (const other of filters) other.setAttribute('aria-pressed', String(other === button));
    refresh();
  });
  function setView(view) {
    library.dataset.layout = view === 'grid' ? 'grid' : 'list';
    for (const button of views) button.setAttribute('aria-pressed', String(button.dataset.view === library.dataset.layout));
  }
  for (const button of views) button.addEventListener('click', () => {
    setView(button.dataset.view);
    try { localStorage.setItem('fen-library-view', button.dataset.view); } catch { /* Storage may be unavailable. */ }
  });
  clear.addEventListener('click', () => {
    search.value = '';
    category = 'all';
    for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.filter === 'all'));
    refresh();
    search.focus();
  });
  try { setView(localStorage.getItem('fen-library-view')); } catch { setView('list'); }
  for (const control of library.querySelectorAll('[disabled]')) control.disabled = false;
  refresh();
}
