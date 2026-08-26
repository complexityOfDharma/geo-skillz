// Persistent navigation. Always visible at >=900px; below that it becomes an
// off-canvas drawer opened from the toolbar hamburger.
import { format } from '../lib/router.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sectionNav(section) {
  if (section.status === 'planned') {
    return `
      <p class="nav-label">${esc(section.title)}</p>
      <span class="nav-item is-disabled">Coming soon</span>`;
  }
  const links = section.categories
    .map(
      (c) =>
        `<a class="nav-item" href="${format({
          kind: 'category',
          sectionId: c.sectionId,
          categoryId: c.id,
        })}" data-route data-category="${c.sectionId}/${c.id}">
           <span class="nav-icon" aria-hidden="true">${esc(c.icon ?? '')}</span>
           <span class="nav-text">${esc(c.title)}</span>
           <span class="nav-count">${c.count}</span>
         </a>`
    )
    .join('');
  return `<p class="nav-label">${esc(section.title)}</p>${links}`;
}

export function createSidebar(sections, { onSearch }) {
  const el = document.createElement('div');
  el.className = 'sidebar-wrap';
  el.innerHTML = `
    <div class="sidebar-backdrop" data-close-nav hidden></div>
    <nav class="sidebar" aria-label="Main">
      <a class="brand" href="#/" data-route>
        <span class="brand-mark" aria-hidden="true">🗺️</span>
        <span class="brand-name">Geo Skillz</span>
      </a>
      <a class="nav-item nav-home" href="#/" data-route data-category="home">
        <span class="nav-icon" aria-hidden="true">🏠</span>
        <span class="nav-text">Home</span>
      </a>
      ${sections.map(sectionNav).join('')}
      <div class="nav-spacer"></div>
      <button class="nav-item" data-open-search>
        <span class="nav-icon" aria-hidden="true">🔍</span>
        <span class="nav-text">Search</span>
        <kbd class="nav-kbd">/</kbd>
      </button>
      <span class="nav-item is-disabled">
        <span class="nav-icon" aria-hidden="true">🎯</span>
        <span class="nav-text">Quiz</span>
        <span class="nav-soon">Soon</span>
      </span>
    </nav>`;

  const backdrop = el.querySelector('.sidebar-backdrop');

  const close = () => {
    el.classList.remove('is-open');
    backdrop.hidden = true;
  };
  const open = () => {
    el.classList.add('is-open');
    backdrop.hidden = false;
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-nav]')) return close();
    if (e.target.closest('[data-open-search]')) {
      close();
      return onSearch();
    }
    // Any navigation click also dismisses the drawer on small screens.
    if (e.target.closest('[data-route]')) close();
  });

  return {
    el,
    open,
    close,
    isOpen: () => el.classList.contains('is-open'),
    // Highlight whichever category the current route sits in.
    setActive(key) {
      for (const item of el.querySelectorAll('[data-category]')) {
        item.classList.toggle('is-active', item.dataset.category === key);
      }
    },
  };
}
