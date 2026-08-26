// Searchable jump-to menu, spanning every slide in every category. Matches on
// title, capital, abbreviation, nickname and region, so "richmond", "VA" and
// "old dominion" all find Virginia.
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createJumpMenu(slides, onPick) {
  const haystacks = slides.map((s) => {
    const d = s.data ?? {};
    return [s.title, d.capital, d.abbreviation, d.nickname, d.region, s.subtitle, s.categoryId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  });

  const panel = document.createElement('div');
  panel.className = 'jump';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Jump to a slide');
  panel.innerHTML = `
    <div class="jump-panel">
      <input class="jump-input" type="search" autocomplete="off" spellcheck="false"
             placeholder="Search states, capitals, features&hellip;" aria-label="Search slides" />
      <ul class="jump-list"></ul>
    </div>`;
  document.body.appendChild(panel);

  const input = panel.querySelector('.jump-input');
  const listEl = panel.querySelector('.jump-list');
  let results = [];
  let cursor = 0;

  function draw() {
    if (!results.length) {
      listEl.innerHTML = '<li class="jump-empty">Nothing matches that.</li>';
      return;
    }
    listEl.innerHTML = results
      .map((i, n) => {
        const s = slides[i];
        return (
          `<li><button class="jump-row${n === cursor ? ' is-on' : ''}" data-index="${i}">` +
          `<span class="jump-name">${esc(s.title)}</span>` +
          `<span class="jump-meta">${esc(s.subtitle ?? '')}</span></button></li>`
        );
      })
      .join('');
    listEl.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
  }

  function filter() {
    const q = input.value.trim().toLowerCase();
    results = slides.map((_, i) => i).filter((i) => !q || haystacks[i].includes(q));
    cursor = 0;
    draw();
  }

  const close = () => { panel.hidden = true; };

  function open() {
    panel.hidden = false;
    input.value = '';
    filter();
    input.focus();
  }

  const pick = (i) => { close(); onPick(slides[i]); };

  input.addEventListener('input', filter);

  panel.addEventListener('click', (e) => {
    if (e.target === panel) return close();
    const row = e.target.closest('[data-index]');
    if (row) pick(Number(row.dataset.index));
  });

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); return close(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, results.length - 1);
      draw();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      draw();
    } else if (e.key === 'Enter' && results.length) {
      e.preventDefault();
      pick(results[cursor]);
    }
  });

  return { open, close, isOpen: () => !panel.hidden };
}
