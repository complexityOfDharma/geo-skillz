// Persistent navigation. Always visible at >=900px; below that it becomes an
// off-canvas drawer opened from the toolbar hamburger.
//
// Sections collapse. They start closed so the sidebar is a short list of two
// choices rather than a wall of every category at once; the section holding the
// current route is opened automatically by setActive().
import { format } from '../lib/router.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sectionNav(section) {
  const planned = section.status === 'planned';
  const body = planned
    ? `<span class="nav-item nav-sub is-disabled">Coming soon</span>`
    : section.categories
        .map(
          (c) =>
            `<a class="nav-item nav-sub" href="${format({
              kind: 'category',
              sectionId: c.sectionId,
              categoryId: c.id,
            })}" data-route data-category="${c.sectionId}/${c.id}">
               <span class="nav-text">${esc(c.title)}</span>
               <span class="nav-count">${c.count}</span>
             </a>`
        )
        .join('');

  return `
    <div class="nav-section" data-section="${esc(section.id)}">
      <button class="nav-toggle" data-toggle-section="${esc(section.id)}"
              aria-expanded="false" aria-controls="nav-body-${esc(section.id)}">
        <span class="nav-caret" aria-hidden="true"></span>
        <span class="nav-text">${esc(section.title)}</span>
      </button>
      <div class="nav-body" id="nav-body-${esc(section.id)}">${body}</div>
    </div>`;
}

export function createSidebar(sections, { onSearch }) {
  const el = document.createElement('div');
  el.className = 'sidebar-wrap';
  el.innerHTML = `
    <div class="sidebar-backdrop" data-close-nav hidden></div>
    <nav class="sidebar" aria-label="Main">
      <a class="brand" href="#/" data-route>
        <span class="brand-name">Geo Skillz</span>
      </a>
      <a class="nav-item nav-home" href="#/" data-route data-category="home">
        <span class="nav-text">Home</span>
      </a>
      ${sections.map(sectionNav).join('')}
      <div class="nav-spacer"></div>
      <button class="nav-item" data-open-search>
        <span class="nav-text">Search</span>
        <kbd class="nav-kbd">/</kbd>
      </button>
      <span class="nav-item is-disabled">
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

  function setExpanded(sectionId, expanded) {
    const section = el.querySelector(`.nav-section[data-section="${sectionId}"]`);
    if (!section) return;
    section.classList.toggle('is-expanded', expanded);
    section.querySelector('.nav-toggle').setAttribute('aria-expanded', String(expanded));
  }

  el.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-section]');
    if (toggle) {
      const id = toggle.dataset.toggleSection;
      const section = el.querySelector(`.nav-section[data-section="${id}"]`);
      return setExpanded(id, !section.classList.contains('is-expanded'));
    }
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
    // Highlight the current category and open the section it lives in, so a
    // deep link never lands you in a collapsed nav with no sense of place.
    setActive(key) {
      for (const item of el.querySelectorAll('[data-category]')) {
        item.classList.toggle('is-active', item.dataset.category === key);
      }
      const sectionId = key.includes('/') ? key.split('/')[0] : null;
      if (sectionId) setExpanded(sectionId, true);
    },
  };
}
