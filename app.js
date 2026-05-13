/**
 * app.js — מחברת
 * 2-column quiet-luxury journal: projects list (left) + editable notes feed (right).
 * Notes persist in localStorage under `dashboard-note:<project.id>`.
 */

const STATUS_HE = {
  live:     'חי',
  building: 'בפיתוח',
  paused:   'מושהה',
  archive:  'ארכיון',
  idea:     'רעיון',
  unknown:  'לא ידוע',
};

const NOTE_KEY = (id) => `dashboard-note:${id}`;
const PLACEHOLDER = 'הוספת תזכורת…';
const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

const projectsListEl = document.getElementById('projects-list');
const notesFeedEl    = document.getElementById('notes-feed');
const mastheadMetaEl = document.getElementById('masthead-meta');

let allProjects = [];
let highlightTimer = null;

// ── Load ──────────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch(`projects-status.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allProjects = data.projects || [];
    renderMastheadMeta(data);
    renderProjects(allProjects);
    renderNotes(allProjects);
  } catch (err) {
    console.error('Failed to load:', err);
    projectsListEl.innerHTML = `<div class="empty-state">אין נתונים — הריצי <code>npm run scan</code>.</div>`;
  }
}

// ── Masthead meta (current month + counts) ────────────────────────
function renderMastheadMeta(data) {
  const now = new Date();
  const month = MONTHS_HE[now.getMonth()];
  const year = String(now.getFullYear()).slice(-2);
  const total = data.projectCount ?? allProjects.length;
  mastheadMetaEl.textContent = `${month} ’${year}  ·  ${total} projects`;
}

// ── Projects list (LEFT) ──────────────────────────────────────────
function renderProjects(projects) {
  projectsListEl.innerHTML = projects.map((p, i) => renderProject(p, i)).join('');
  projectsListEl.querySelectorAll('.project').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const id = el.dataset.id;
      focusNote(id);
    });
  });
}

function renderProject(p, i) {
  const id = p.name;
  const idx = String(i + 1).padStart(2, '0');
  const title = p.humanName || p.name;
  const tagline = p.tagline || '';
  const links = collectLinks(p);
  const time = p.lastActivityHebrew || '';
  const status = p.status || 'unknown';
  const statusLabel = STATUS_HE[status] || STATUS_HE.unknown;

  const thumb = p.screenshot
    ? `<div class="project-thumb"><img src="${esc(p.screenshot)}" alt="" loading="lazy"></div>`
    : `<div class="project-thumb placeholder" style="background:${tintFor(p.accentColor)}"><span class="project-thumb-initial" style="color:${esc(p.accentColor || '#6b6457')}">${esc(initialOf(title))}</span></div>`;

  const linksHtml = links.length
    ? links.map((l, idx) => {
        const sep = idx > 0 ? `<span class="project-foot-sep" aria-hidden="true"></span>` : '';
        return `${sep}<a class="project-link" data-kind="${l.kind}" href="${esc(l.url)}" target="_blank" rel="noopener" dir="ltr">${esc(l.label)} ↗</a>`;
      }).join('')
    : `<span class="mono-label" style="color:var(--ink-soft)">— no links</span>`;

  const timeHtml = time ? `<span class="project-time">${esc(time)}</span>` : '';

  return `
    <article class="project" data-id="${esc(id)}">
      <div class="project-index">${idx}</div>
      <div class="project-body">
        <div class="project-head">
          <h2 class="project-title">${esc(title)}</h2>
          <span class="project-status">
            <span class="status-dot ${esc(status)}" aria-hidden="true"></span>
            ${esc(statusLabel)}
          </span>
        </div>
        ${tagline ? `<p class="project-tagline">${esc(tagline)}</p>` : ''}
        ${thumb}
        <div class="project-foot">
          ${linksHtml}
          ${timeHtml}
        </div>
      </div>
    </article>
  `;
}

// ── Notes feed (RIGHT) ────────────────────────────────────────────
function renderNotes(projects) {
  notesFeedEl.innerHTML = projects.map(renderNoteBlock).join('');
  notesFeedEl.querySelectorAll('.note-body').forEach(bindNoteEditor);
}

function renderNoteBlock(p) {
  const id = p.name;
  const title = p.humanName || p.name;
  const initial = (localStorage.getItem(NOTE_KEY(id)) ?? p.notes ?? '').trim();
  return `
    <section class="note" id="note-${cssId(id)}" data-id="${esc(id)}">
      <header class="note-head">
        <h3 class="note-title">${esc(title)}</h3>
        <span class="note-saved" aria-live="polite">saved</span>
      </header>
      <div
        class="note-body"
        contenteditable="true"
        spellcheck="false"
        dir="auto"
        data-placeholder="${esc(PLACEHOLDER)}"
      >${esc(initial)}</div>
    </section>
  `;
}

function bindNoteEditor(el) {
  const note = el.closest('.note');
  const id = note.dataset.id;
  const savedEl = note.querySelector('.note-saved');
  let debounce;
  let savedTimer;

  el.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const value = el.innerText.replace(/ /g, ' ').trimEnd();
      if (value) localStorage.setItem(NOTE_KEY(id), value);
      else localStorage.removeItem(NOTE_KEY(id));
      flashSaved(savedEl);
    }, 400);
  });

  el.addEventListener('blur', () => {
    clearTimeout(debounce);
    const value = el.innerText.replace(/ /g, ' ').trimEnd();
    if (value) localStorage.setItem(NOTE_KEY(id), value);
    else localStorage.removeItem(NOTE_KEY(id));
  });

  function flashSaved(el) {
    el.classList.add('is-visible');
    el.textContent = 'saved · just now';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('is-visible'), 1600);
  }
}

// ── Cross-column interaction ──────────────────────────────────────
function focusNote(id) {
  const note = notesFeedEl.querySelector(`.note[data-id="${cssAttr(id)}"]`);
  if (!note) return;
  note.scrollIntoView({ behavior: 'smooth', block: 'start' });

  notesFeedEl.querySelectorAll('.note.is-highlighted').forEach(n => n.classList.remove('is-highlighted'));
  note.classList.add('is-highlighted');
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => note.classList.remove('is-highlighted'), 1400);

  const body = note.querySelector('.note-body');
  if (body) body.focus({ preventScroll: true });
}

// ── Link inference ────────────────────────────────────────────────
function collectLinks(p) {
  const out = [];
  if (p.liveUrl) out.push({ kind: 'live', label: hostLabel(p.liveUrl), url: p.liveUrl });
  if (p.githubUrl) out.push({ kind: 'repo', label: 'repo', url: p.githubUrl });
  return out;
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

// ── Utilities ─────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function cssId(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cssAttr(s) {
  return String(s).replace(/(["\\])/g, '\\$1');
}

function initialOf(title) {
  if (!title) return '·';
  const trimmed = String(title).trim();
  return trimmed.charAt(0) || '·';
}

function tintFor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return 'var(--bone-deep)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.08)`;
}

document.addEventListener('DOMContentLoaded', loadData);
