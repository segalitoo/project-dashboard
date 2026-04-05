/**
 * app.js — לוח מצב פרוייקטים
 * טוען projects-status.json, מרנדר שורות, מסנן וחיפוש
 */

// ── State ───────────────────────────────────────────────────────────
let allProjects = [];
let currentFilter = 'all';

// ── DOM ─────────────────────────────────────────────────────────────
const list = document.getElementById('project-list');
const searchInput = document.getElementById('search-input');
const statsBar = document.getElementById('stats-bar');
const lastUpdatedEl = document.getElementById('last-updated');

// ── Hebrew labels ───────────────────────────────────────────────────
const STATUS_LABELS = {
  active: 'פעיל',
  idle: 'ממתין',
  stale: 'לא פעיל',
  unknown: 'לא ידוע',
};

// ── Load Data ───────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch(`projects-status.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allProjects = data.projects;

    document.getElementById('count-total').textContent = data.projectCount;
    document.getElementById('count-active').textContent = data.activeCount;
    document.getElementById('count-idle').textContent = data.idleCount;
    document.getElementById('count-stale').textContent = data.staleCount;

    lastUpdatedEl.innerHTML = `<span class="live-dot"></span> עודכן ${formatRelativeTime(data.lastUpdated)}`;

    renderProjects();
  } catch (err) {
    console.error('Failed to load project data:', err);
    list.innerHTML = `
      <div class="empty-state">
        <p>לא ניתן לטעון נתונים. יש להריץ <code>npm run scan</code> קודם.</p>
      </div>
    `;
  }
}

// ── Render ───────────────────────────────────────────────────────────
function renderProjects() {
  const query = searchInput.value.toLowerCase().trim();

  const filtered = allProjects.filter(project => {
    const matchesFilter = currentFilter === 'all' || project.status === currentFilter;
    const matchesSearch = !query ||
      project.name.toLowerCase().includes(query) ||
      project.description.toLowerCase().includes(query) ||
      project.stack.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>לא נמצאו פרוייקטים תואמים.</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(renderRow).join('');
}

function renderRow(project) {
  const { name, emoji, description, stack, status, git, recentActions, lastSession, lastActivity, size } = project;

  const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.unknown;

  // Meta tags
  const tags = [];
  tags.push(`<span class="tag">${esc(stack)}</span>`);
  if (size && size !== 'unknown') {
    tags.push(`<span class="tag">${size}</span>`);
  }
  if (git?.isDirty) {
    tags.push(`<span class="tag dirty">${git.changedFiles} קבצים שונו</span>`);
  }

  // Git info
  let gitHtml = '';
  if (git) {
    gitHtml = `
      <div class="git-info">
        <span class="branch">${esc(git.branch)}</span>
        <span class="separator">·</span>
        <span class="commit-msg">${esc(git.lastCommitMessage)}</span>
        <span class="separator">·</span>
        <span class="commit-time">${translateRelativeTime(git.lastCommitRelative)}</span>
      </div>
    `;
  }

  // Actions — show all text, no truncation
  let actionsHtml = '';
  const actions = recentActions.filter(a => {
    // Filter out IDE-opened-file noise
    return !a.text.startsWith('<ide_opened_file>');
  }).slice(0, 5);

  if (actions.length > 0) {
    const items = actions.map(a => {
      const text = cleanActionText(a.text);
      if (!text) return '';
      return `
        <div class="action-line">
          <span class="bullet ${a.type}"></span>
          <span class="text">${esc(text)}</span>
        </div>
      `;
    }).filter(Boolean).join('');

    if (items) {
      actionsHtml = `
        <div class="actions-block">
          <div class="actions-label">פעילות אחרונה</div>
          ${items}
        </div>
      `;
    }
  }

  // Footer
  const activityText = lastActivity ? `עדכון אחרון ${formatRelativeTime(lastActivity)}` : 'אין פעילות מתועדת';

  const chatBtn = lastSession
    ? `<button class="chat-link-btn">צ׳אט אחרון</button>`
    : '';

  return `
    <article class="project-row" data-status="${status}">
      <div class="row-top">
        <h2 class="project-name">
          <span class="emoji">${emoji}</span>
          ${esc(name)}
        </h2>
        <span class="status-tag ${status}">${statusLabel}</span>
      </div>

      <p class="project-desc">${esc(description)}</p>

      <div class="project-meta">${tags.join('')}</div>

      ${gitHtml}
      ${actionsHtml}

      <div class="row-footer">
        <span>${activityText}</span>
        ${chatBtn}
      </div>
    </article>
  `;
}

// ── Events ──────────────────────────────────────────────────────────
statsBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.stat-pill');
  if (!btn) return;

  currentFilter = btn.dataset.filter;

  document.querySelectorAll('.stat-pill').forEach(el => el.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');

  renderProjects();
});

let debounce;
searchInput.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(renderProjects, 150);
});

// ── Utilities ───────────────────────────────────────────────────────
function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (min < 1) return 'הרגע';
  if (min < 60) return `לפני ${min} דקות`;
  if (hrs < 24) return `לפני ${hrs} שעות`;
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 365) return `לפני ${Math.floor(days / 30)} חודשים`;
  return `לפני ${Math.floor(days / 365)} שנים`;
}

function translateRelativeTime(eng) {
  if (!eng) return '';
  // Translate common English relative times to Hebrew
  return eng
    .replace(/^(\d+) seconds? ago$/, 'לפני $1 שניות')
    .replace(/^(\d+) minutes? ago$/, 'לפני $1 דקות')
    .replace(/^(\d+) hours? ago$/, 'לפני $1 שעות')
    .replace(/^(\d+) days? ago$/, 'לפני $1 ימים')
    .replace(/^(\d+) weeks? ago$/, 'לפני $1 שבועות')
    .replace(/^(\d+) months? ago$/, 'לפני $1 חודשים')
    .replace(/^(\d+) years? ago$/, 'לפני $1 שנים')
    .replace(/^yesterday$/, 'אתמול')
    .replace(/^just now$/, 'הרגע');
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function cleanActionText(text) {
  if (!text) return '';
  // Strip IDE noise entirely
  if (text.startsWith('<ide_opened_file>')) return '';
  text = text.replace(/^<[^>]+>/, '');
  // Don't truncate — show full text
  return text;
}

// ── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadData);
