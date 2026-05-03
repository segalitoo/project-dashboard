/* Bento variant — Apple-style modular grid */

const STATUS_HE = {
  live: 'חי', building: 'בפיתוח', paused: 'מושהה',
  archive: 'ארכיון', idea: 'רעיון', unknown: '—',
};

let allProjects = [];
let currentFilter = 'all';

const bentoEl = document.getElementById('bento');
const filtersEl = document.getElementById('filters');
const metaEl = document.getElementById('hdr-meta');
const modalEl = document.getElementById('modal');
const backdropEl = document.getElementById('backdrop');
const modalContentEl = document.getElementById('modal-content');
const modalCloseEl = document.getElementById('modal-close');

async function load() {
  const res = await fetch(`projects-status.json?t=${Date.now()}`);
  const data = await res.json();
  allProjects = data.projects || [];

  document.getElementById('c-all').textContent = data.projectCount;
  document.getElementById('c-live').textContent = data.counts?.live ?? 0;
  document.getElementById('c-building').textContent = data.counts?.building ?? 0;
  document.getElementById('c-paused').textContent = data.counts?.paused ?? 0;
  document.getElementById('c-archive').textContent = data.counts?.archive ?? 0;
  document.getElementById('c-idea').textContent = data.counts?.idea ?? 0;

  const live = data.counts?.live ?? 0;
  metaEl.innerHTML = `
    <strong>${data.projectCount}</strong> פרוייקטים &nbsp;·&nbsp;
    <span class="live-badge">${live} חיים</span> &nbsp;·&nbsp;
    עודכן ${esc(data.lastUpdatedHebrew || '')}
  `;

  render();
}

function render() {
  const filtered = currentFilter === 'all'
    ? allProjects
    : allProjects.filter(p => p.status === currentFilter);

  if (filtered.length === 0) {
    bentoEl.innerHTML = `<div class="empty">אין פרוייקטים בקטגוריה הזו</div>`;
    return;
  }

  // Pattern: 1st = hero (2x2), then alternating sizes for visual variety
  // Sizes pattern: hero, normal, normal, wide, normal, normal, tall, normal...
  const sizePattern = [null, '', '', 'wide', '', '', 'tall', '', '', 'wide', '', ''];

  bentoEl.innerHTML = filtered.map((p, i) => {
    const isHero = i === 0 && currentFilter === 'all';
    const sizeClass = isHero ? 'hero' : (sizePattern[i] || '');
    return renderTile(p, sizeClass, isHero);
  }).join('');

  bentoEl.querySelectorAll('.tile').forEach((el, i) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('button')) return;
      openModal(filtered[i]);
    });
  });
}

function renderTile(p, sizeClass, isHero) {
  const accent = p.accentColor || '#888';
  const statusClass = p.status || 'unknown';
  const liveDot = p.status === 'live' || p.isLive ? `<span class="live-dot"></span>` : '';

  if (isHero) {
    return `
      <article class="tile hero ${sizeClass}" style="--accent: ${esc(accent)}">
        <div class="tile-top">
          <span class="tile-status ${statusClass}">${liveDot}${esc(STATUS_HE[statusClass])}</span>
          ${p.category ? `<span class="tile-category">${esc(p.category)}</span>` : ''}
        </div>
        <h2 class="tile-title">${esc(p.humanName || p.name)}</h2>
        <p class="tile-tagline">${esc(p.tagline || '')}</p>
        ${p.nextStep ? `
          <div class="tile-next">
            <span class="tile-next-label">הצעד הבא</span>
            ${esc(p.nextStep)}
          </div>
        ` : ''}
        <div class="tile-actions">
          ${p.liveUrl ? `<a class="tile-cta" href="${esc(p.liveUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">פתח באתר ↗</a>` : ''}
          ${p.githubUrl ? `<a class="tile-cta secondary" href="${esc(p.githubUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">GitHub</a>` : ''}
        </div>
        <div class="tile-bottom">
          <span class="tile-time">${esc(p.lastActivityHebrew || '—')}</span>
        </div>
      </article>
    `;
  }

  return `
    <article class="tile ${sizeClass}" style="--accent: ${esc(accent)}">
      <div class="tile-top">
        <span class="tile-status ${statusClass}">${liveDot}${esc(STATUS_HE[statusClass])}</span>
        ${p.category ? `<span class="tile-category">${esc(p.category)}</span>` : ''}
      </div>
      <h3 class="tile-title">${esc(p.humanName || p.name)}</h3>
      <p class="tile-tagline">${esc(p.tagline || '')}</p>
      ${p.nextStep ? `
        <div class="tile-next">
          <span class="tile-next-label">הצעד הבא</span>
          ${esc(p.nextStep)}
        </div>
      ` : ''}
      <div class="tile-bottom">
        <span class="tile-time">${esc(p.lastActivityHebrew || '—')}</span>
        <span class="tile-arrow">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L4 7L9 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
    </article>
  `;
}

function openModal(p) {
  modalContentEl.innerHTML = renderModal(p);
  modalEl.style.setProperty('--accent', p.accentColor || '#888');
  modalEl.hidden = false;
  backdropEl.hidden = false;
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => modalCloseEl.focus(), 100);
}

function closeModal() {
  modalEl.style.transform = 'translateX(-110%)';
  setTimeout(() => {
    modalEl.hidden = true;
    backdropEl.hidden = true;
    modalEl.style.transform = '';
    modalContentEl.innerHTML = '';
    document.body.style.overflow = '';
  }, 380);
}

function renderModal(p) {
  const statusClass = p.status || 'unknown';
  const liveDot = p.status === 'live' || p.isLive ? `<span class="live-dot"></span>` : '';
  const stamp = `<span class="tile-status ${statusClass}">${liveDot}${esc(STATUS_HE[statusClass])}</span>`;

  const chips = [];
  if (p.stack && p.stack !== 'Unknown' && p.stack !== '—') {
    p.stack.split(' + ').forEach(s => chips.push(`<span class="modal-chip">${esc(s)}</span>`));
  }
  if (p.size && p.size !== 'unknown' && p.size !== 'cloud' && p.size !== 'meta') {
    chips.push(`<span class="modal-chip">${esc(p.size)}</span>`);
  }

  const acts = (p.recentActions || [])
    .filter(a => a.text && !a.text.startsWith('<ide_opened_file>'))
    .slice(0, 5)
    .map(a => `
      <div class="modal-act">
        <span class="modal-act-mark ${a.type}">${a.type}</span>
        <span>${esc(cleanText(a.text))}</span>
      </div>
    `).join('');

  let gitBlock = '';
  if (p.git && p.git.lastCommitMessage) {
    gitBlock = `
      <div class="modal-section">
        <span class="modal-section-label">Git</span>
        <div class="modal-text" dir="ltr" style="text-align:left; font-family: var(--font-mono); font-size: 13px;">
          <strong>${esc(p.git.branch || '')}</strong> · ${esc(p.git.lastCommitHebrew || '')}<br>
          "${esc(p.git.lastCommitMessage)}"
        </div>
      </div>
    `;
  }

  const links = [];
  if (p.liveUrl) links.push(`<a class="modal-cta primary" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">פתח באתר ↗</a>`);
  if (p.githubUrl) links.push(`<a class="modal-cta" href="${esc(p.githubUrl)}" target="_blank" rel="noopener">GitHub ↗</a>`);

  return `
    <div class="modal-status-row">${stamp}</div>
    <h2 class="modal-title">${esc(p.humanName || p.name)}</h2>
    <p class="modal-tagline">${esc(p.tagline || '')}</p>

    ${p.nextStep ? `
      <div class="modal-section">
        <span class="modal-section-label">הצעד הבא</span>
        <div class="modal-next">
          <div class="modal-next-text">${esc(p.nextStep)}</div>
        </div>
      </div>
    ` : ''}

    ${p.longDescription ? `
      <div class="modal-section">
        <span class="modal-section-label">סיפור הפרוייקט</span>
        <p class="modal-text">${esc(p.longDescription)}</p>
      </div>
    ` : ''}

    ${links.length ? `
      <div class="modal-section">
        <span class="modal-section-label">קישורים</span>
        <div class="modal-actions">${links.join('')}</div>
      </div>
    ` : ''}

    ${chips.length ? `
      <div class="modal-section">
        <span class="modal-section-label">טכנולוגיה</span>
        <div class="modal-chips">${chips.join('')}</div>
      </div>
    ` : ''}

    ${gitBlock}

    ${acts ? `
      <div class="modal-section">
        <span class="modal-section-label">פעילות אחרונה</span>
        <div class="modal-activity">${acts}</div>
      </div>
    ` : ''}
  `;
}

filtersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  filtersEl.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  render();
});

modalCloseEl.addEventListener('click', closeModal);
backdropEl.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalEl.hidden) closeModal();
});

function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function cleanText(t) {
  if (!t) return '';
  return t.replace(/^<[^>]+>/, '').trim();
}

document.addEventListener('DOMContentLoaded', load);
