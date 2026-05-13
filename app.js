/**
 * app.js — מעקב
 * Dark tracker: hero + per-project feed (image card + content + inline notes + expandable details).
 * Notes persist in localStorage under `dashboard-note:<project.id>`.
 */

const STATUS_HE = {
  live:     'חי',
  building: 'בעבודה',
  paused:   'מושהה',
  archive:  'ארכיון',
  idea:     'רעיון',
  unknown:  'לא ידוע',
};

const ACTIVE_STATUSES = new Set(['live', 'building']);
const NOTE_KEY = (id) => `dashboard-note:${id}`;
const PLACEHOLDER = 'הוסיפו תזכורת מהירה…';
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const feedEl       = document.getElementById('feed');
const heroCountEl  = document.getElementById('hero-count');
const footerMetaEl = document.getElementById('footer-meta');

let allProjects = [];

// ── Load ──────────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch(`projects-status.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allProjects = data.projects || [];
    renderHeroCount(allProjects);
    renderFeed(allProjects);
    renderFooter(data);
  } catch (err) {
    console.error('Failed to load:', err);
    feedEl.innerHTML = `<div class="empty-state">אין נתונים — הריצו <code>npm run scan</code>.</div>`;
  }
}

// ── Hero count (Hebrew pluralization) ─────────────────────────────
function renderHeroCount(projects) {
  const active = projects.filter(p => ACTIVE_STATUSES.has(p.status)).length;
  if (active === 0) {
    heroCountEl.innerHTML = 'אין פרויקטים פעילים כרגע';
  } else if (active === 1) {
    heroCountEl.innerHTML = 'מציג <strong>פרויקט אחד</strong> פעיל';
  } else {
    heroCountEl.innerHTML = `מציג <strong>${active}</strong> פרויקטים פעילים`;
  }
}

// ── Footer meta ───────────────────────────────────────────────────
function renderFooter(data) {
  const now = new Date();
  const month = MONTHS_HE[now.getMonth()].toUpperCase();
  const year = String(now.getFullYear()).slice(-2);
  const total = data.projectCount ?? allProjects.length;
  footerMetaEl.textContent = `${month} '${year}  ·  ${total} PROJECTS`;
}

// ── Feed ──────────────────────────────────────────────────────────
function renderFeed(projects) {
  if (!projects.length) {
    feedEl.innerHTML = `<div class="empty-state">אין פרויקטים להציג עדיין.</div>`;
    return;
  }
  feedEl.innerHTML = projects.map(renderProject).join('');
  feedEl.querySelectorAll('.notes-body').forEach(bindNoteEditor);
  feedEl.querySelectorAll('.cta').forEach(bindCta);
  feedEl.querySelectorAll('.notes-save').forEach(bindSaveButton);
}

function renderProject(p) {
  const id = p.name;
  const title = p.humanName || p.name;
  const desc = p.longDescription || p.tagline || '';
  const category = p.category ? p.category.toUpperCase() : '';
  const date = formatHebrewDate(p.lastActivity);

  return `
    <article class="project" data-id="${esc(id)}">
      ${renderMedia(p, title)}
      <div class="project-content">
        ${(date || category) ? `
        <div class="project-meta">
          ${date ? `<span class="project-date">${esc(date)}</span>` : ''}
          ${date && category ? `<span class="meta-sep" aria-hidden="true">—</span>` : ''}
          ${category ? `<span class="project-cat" dir="ltr">${esc(category)}</span>` : ''}
        </div>` : ''}
        <h2 class="project-title">${esc(title)}</h2>
        ${desc ? `<p class="project-desc">${esc(desc)}</p>` : ''}
        ${renderNotes(p)}
        <button class="cta" type="button" aria-expanded="false">
          <span class="cta-label">צפה בפרטים מלאים</span>
          <span class="cta-arrow" aria-hidden="true">↘</span>
        </button>
        <div class="project-details" aria-hidden="true">
          <div class="project-details-inner">
            ${renderDetails(p)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderMedia(p, title) {
  const status = p.status || 'unknown';
  const statusLabel = STATUS_HE[status] || STATUS_HE.unknown;
  const pill = `
    <div class="status-pill" data-status="${esc(status)}">
      <span class="status-dot" aria-hidden="true"></span>
      <span>${esc(statusLabel)}</span>
    </div>
  `;

  if (p.screenshot) {
    return `
      <div class="project-media">
        ${pill}
        <img src="${esc(p.screenshot)}" alt="${esc(title)}" loading="lazy">
      </div>
    `;
  }

  return `
    <div class="project-media placeholder">
      ${pill}
      <span class="project-media-initial" aria-hidden="true">${esc(initialOf(title))}</span>
    </div>
  `;
}

function renderNotes(p) {
  const id = p.name;
  const initial = (localStorage.getItem(NOTE_KEY(id)) ?? p.notes ?? '').trim();
  return `
    <div class="notes">
      <div class="notes-head">
        <button class="notes-save" type="button" aria-label="שמור הערות">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span class="notes-save-label">שמור</span>
        </button>
        <h3 class="notes-label">הערות מהירות</h3>
      </div>
      <div
        class="notes-body"
        contenteditable="true"
        spellcheck="false"
        dir="auto"
        data-placeholder="${esc(PLACEHOLDER)}"
      >${esc(initial)}</div>
    </div>
  `;
}

function renderDetails(p) {
  const rows = [];

  if (p.nextStep) {
    rows.push(detailRow('הצעד הבא', esc(p.nextStep)));
  }
  if (p.lastActivityHebrew) {
    rows.push(detailRow('פעילות', esc(p.lastActivityHebrew)));
  }

  const tags = [];
  if (p.stack) tags.push(p.stack);
  if (p.category && p.category !== p.stack) tags.push(p.category);
  if (tags.length) {
    rows.push(detailRow(
      'תגיות',
      `<div class="detail-tags">${tags.map(t => `<span class="detail-tag">${esc(t)}</span>`).join('')}</div>`
    ));
  }

  const links = [];
  if (p.liveUrl) {
    links.push(`<a href="${esc(p.liveUrl)}" target="_blank" rel="noopener" dir="ltr">${esc(hostLabel(p.liveUrl))} ↗</a>`);
  }
  if (p.githubUrl) {
    links.push(`<a href="${esc(p.githubUrl)}" target="_blank" rel="noopener" dir="ltr">repo ↗</a>`);
  }
  if (links.length) {
    rows.push(detailRow('קישורים', links.join('  ·  ')));
  }

  if (!rows.length) {
    return `<div class="detail-row"><span class="detail-label">אין</span><span class="detail-value">אין פרטים נוספים</span></div>`;
  }
  return rows.join('');
}

function detailRow(label, valueHtml) {
  return `
    <div class="detail-row">
      <span class="detail-label">${esc(label)}</span>
      <span class="detail-value">${valueHtml}</span>
    </div>
  `;
}

// ── Notes editor ──────────────────────────────────────────────────
function bindNoteEditor(el) {
  const project = el.closest('.project');
  const id = project.dataset.id;
  const saveBtn = project.querySelector('.notes-save');
  let debounce;

  el.addEventListener('input', () => {
    saveBtn.classList.remove('is-saved');
    clearTimeout(debounce);
    debounce = setTimeout(() => persist(id, el, saveBtn), 500);
  });

  el.addEventListener('blur', () => {
    clearTimeout(debounce);
    persist(id, el, saveBtn);
  });
}

function bindSaveButton(btn) {
  btn.addEventListener('click', () => {
    const project = btn.closest('.project');
    const body = project.querySelector('.notes-body');
    if (!body) return;
    persist(project.dataset.id, body, btn);
  });
}

function persist(id, el, btn) {
  const value = el.innerText.replace(/ /g, ' ').trimEnd();
  if (value) localStorage.setItem(NOTE_KEY(id), value);
  else localStorage.removeItem(NOTE_KEY(id));
  flashSaved(btn);
}

function flashSaved(btn) {
  const label = btn.querySelector('.notes-save-label');
  btn.classList.add('is-saved');
  if (label) label.textContent = 'נשמר';
  clearTimeout(btn._savedTimer);
  btn._savedTimer = setTimeout(() => {
    btn.classList.remove('is-saved');
    if (label) label.textContent = 'שמור';
  }, 1600);
}

// ── CTA (expand inline details) ───────────────────────────────────
function bindCta(btn) {
  btn.addEventListener('click', () => {
    const project = btn.closest('.project');
    const expanded = project.classList.toggle('is-expanded');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const details = project.querySelector('.project-details');
    if (details) details.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    const label = btn.querySelector('.cta-label');
    if (label) label.textContent = expanded ? 'סגרו את הפרטים' : 'צפה בפרטים מלאים';
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function formatHebrewDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_HE[d.getMonth()]} ${d.getFullYear()}`;
}

function hostLabel(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('vercel.app')) return 'vercel';
    if (host.endsWith('netlify.app') || host.endsWith('netlify.com')) return 'netlify';
    if (host.endsWith('github.io')) return 'pages';
    if (host.endsWith('pages.dev')) return 'cloudflare';
    if (host.endsWith('fly.dev')) return 'fly';
    if (host.endsWith('render.com')) return 'render';
    return 'live';
  } catch {
    return 'live';
  }
}

function esc(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function initialOf(title) {
  if (!title) return '·';
  const trimmed = String(title).trim();
  return trimmed.charAt(0) || '·';
}

document.addEventListener('DOMContentLoaded', loadData);
