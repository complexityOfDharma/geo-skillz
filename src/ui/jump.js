// Searchable jump-to menu. Matches on state name, capital, abbreviation,
// nickname and region, so "richmond", "VA" and "old dominion" all find Virginia.
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createJumpMenu(deck, onPick) {
  const haystacks = deck.map((s) => {
    const d = s.data ?? {};
    return [s.title, d.capital, d.abbreviation, d.nickname, d.region, s.subtitle]
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
        const meta = deck[i].subtitle ?? (deck[i].kind === 'overview' ? 'Start here' : '');
        return (
          `<li><button class="jump-row${n === cursor ? ' is-on' : ''}" data-index="${i}">` +
          `<span class="jump-name">${esc(deck[i].title)}</span>` +
          `<span class="jump-meta">${esc(meta)}</span></button></li>`
        );
      })
      .join('');
    listEl.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
  }

  function filter() {
    const q = input.value.trim().toLowerCase();
    results = deck.map((_, i) => i).filter((i) => !q || haystacks[i].includes(q));
    cursor = 0;
    draw();
  }

  function close() {
    panel.hidden = true;
  }

  function open() {
    panel.hidden = false;
    input.value = '';
    filter();
    input.focus();
  }

  input.addEventListener('input', filter);

  panel.addEventListener('click', (e) => {
    if (e.target === panel) return close();
    const row = e.target.closest('[data-index]');
    if (row) {
      close();
      onPick(Number(row.dataset.index));
    }
  });

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
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
      close();
      onPick(results[cursor]);
    }
  });

  return { open, close, isOpen: () => !panel.hidden };
}
