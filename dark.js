/* Dark Premium variant — Linear/Vercel-style dense list */

const STATUS_LABEL = {
  live:     'Live',
  building: 'Building',
  paused:   'Paused',
  archive:  'Archived',
  idea:     'Idea',
  unknown:  '—',
};

let allProjects = [];
let currentFilter = 'all';

const listEl = document.getElementById('list');
const filtersEl = document.getElementById('filters');
const metaEl = document.getElementById('hdr-meta');
const searchInput = document.getElementById('search');

const panelEl = document.getElementById('panel');
const backdropEl = document.getElementById('backdrop');
const panelContentEl = document.getElementById('panel-content');
const panelCloseEl = document.getElementById('panel-close');

async function load() {
  const res = await fetch(`projects-status.json?t=${Date.now()}`);
  const data = await res.json();
  allProjects = data.projects || [];

  document.getElementById('s-total').textContent = data.projectCount;
  document.getElementById('s-live').textContent = data.counts?.live ?? 0;
  document.getElementById('s-building').textContent = data.counts?.building ?? 0;

  document.getElementById('c-all').textContent = data.projectCount;
  document.getElementById('c-live').textContent = data.counts?.live ?? 0;
  document.getElementById('c-building').textContent = data.counts?.building ?? 0;
  document.getElementById('c-paused').textContent = data.counts?.paused ?? 0;
  document.getElementById('c-archive').textContent = data.counts?.archive ?? 0;
  document.getElementById('c-idea').textContent = data.counts?.idea ?? 0;

  metaEl.textContent = `עודכן ${data.lastUpdatedHebrew || ''}`;

  render();
}

function render() {
  const q = searchInput.value.toLowerCase().trim();
  const filtered = allProjects.filter(p => {
    const f = currentFilter === 'all' || p.status === currentFilter;
    const s = !q ||
      (p.humanName || p.name).toLowerCase().includes(q) ||
      (p.tagline || '').toLowerCase().includes(q) ||
      (p.longDescription || '').toLowerCase().includes(q) ||
      (p.stack || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q);
    return f && s;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">לא נמצאו פרוייקטים</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(renderRow).join('');
  listEl.querySelectorAll('.row').forEach((el, i) => {
    el.addEventListener('click', () => openPanel(filtered[i]));
  });
}

function renderRow(p) {
  const statusClass = p.status || 'unknown';
  const accent = p.accentColor || '#888';
  const label = STATUS_LABEL[statusClass] || '—';

  return `
    <div class="row" style="--accent: ${esc(accent)}">
      <div class="row-status">
        <span class="status-dot ${statusClass}"></span>
        <span class="status-label">${esc(label)}</span>
      </div>

      <div class="row-name">
        <div class="row-title">
          <span class="accent-bar"></span>
          ${esc(p.humanName || p.name)}
        </div>
        <div class="row-tagline">${esc(p.tagline || '—')}</div>
      </div>

      <div class="row-next ${p.nextStep ? '' : 'empty'}">
        ${p.nextStep ? esc(p.nextStep) : 'אין צעד הבא'}
      </div>

      <div class="row-time">
        <span class="row-time-text">${esc(p.lastActivityHebrew || '—')}</span>
        <span class="row-arrow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 3L4 6L8 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
    </div>
  `;
}

function openPanel(p) {
  panelContentEl.innerHTML = renderPanel(p);
  panelEl.style.setProperty('--accent', p.accentColor || '#888');
  panelEl.hidden = false;
  backdropEl.hidden = false;
  panelEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => panelCloseEl.focus(), 100);
}

function closePanel() {
  panelEl.style.transform = 'translateX(-110%)';
  setTimeout(() => {
    panelEl.hidden = true;
    backdropEl.hidden = true;
    panelEl.style.transform = '';
    panelContentEl.innerHTML = '';
    document.body.style.overflow = '';
  }, 380);
}

function renderPanel(p) {
  const statusClass = p.status || 'unknown';
  const label = STATUS_LABEL[statusClass] || '—';
  const stamp = `
    <span class="panel-status-pill">
      <span class="status-dot ${statusClass}"></span>
      ${esc(label)}
    </span>
  `;

  const chips = [];
  if (p.stack && p.stack !== 'Unknown' && p.stack !== '—') {
    p.stack.split(' + ').forEach(s => chips.push(`<span class="panel-chip">${esc(s)}</span>`));
  }
  if (p.size && !['unknown', 'cloud', 'meta'].includes(p.size)) {
    chips.push(`<span class="panel-chip">${esc(p.size)}</span>`);
  }
  if (p.category) {
    chips.push(`<span class="panel-chip">${esc(p.category)}</span>`);
  }

  const acts = (p.recentActions || [])
    .filter(a => a.text && !a.text.startsWith('<ide_opened_file>'))
    .slice(0, 5)
    .map(a => `
      <div class="panel-act">
        <span class="panel-act-mark ${a.type}">${a.type}</span>
        <span>${esc(cleanText(a.text))}</span>
      </div>
    `).join('');

  let gitBlock = '';
  if (p.git && p.git.lastCommitMessage) {
    gitBlock = `
      <div class="panel-section">
        <div class="panel-section-label">Git</div>
        <div class="panel-git">
          <span class="branch">${esc(p.git.branch || '')}</span> <span class="meta">· ${esc(p.git.lastCommitHebrew || '')}</span>
          <span class="msg">"${esc(p.git.lastCommitMessage)}"</span>
        </div>
      </div>
    `;
  }

  const links = [];
  if (p.liveUrl) links.push(`<a class="panel-cta primary" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">פתח באתר ↗</a>`);
  if (p.githubUrl) links.push(`<a class="panel-cta" href="${esc(p.githubUrl)}" target="_blank" rel="noopener">GitHub ↗</a>`);

  return `
    <div class="panel-status-row">${stamp}</div>
    <h2 class="panel-title">${esc(p.humanName || p.name)}</h2>
    <p class="panel-tagline">${esc(p.tagline || '')}</p>

    ${p.nextStep ? `
      <div class="panel-section">
        <div class="panel-section-label">הצעד הבא</div>
        <div class="panel-next">
          <div class="panel-next-text">${esc(p.nextStep)}</div>
        </div>
      </div>
    ` : ''}

    ${p.longDescription ? `
      <div class="panel-section">
        <div class="panel-section-label">סיפור הפרוייקט</div>
        <p class="panel-text">${esc(p.longDescription)}</p>
      </div>
    ` : ''}

    ${links.length ? `
      <div class="panel-section">
        <div class="panel-section-label">קישורים</div>
        <div class="panel-actions">${links.join('')}</div>
      </div>
    ` : ''}

    ${chips.length ? `
      <div class="panel-section">
        <div class="panel-section-label">טכנולוגיה</div>
        <div class="panel-chips">${chips.join('')}</div>
      </div>
    ` : ''}

    ${gitBlock}

    ${acts ? `
      <div class="panel-section">
        <div class="panel-section-label">פעילות אחרונה</div>
        <div class="panel-activity">${acts}</div>
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

let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(render, 120);
});

panelCloseEl.addEventListener('click', closePanel);
backdropEl.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panelEl.hidden) closePanel();
  // Cmd+K or Ctrl+K to focus search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
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
