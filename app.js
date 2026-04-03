/**
 * app.js — Project Dashboard Client
 * Loads projects-status.json, renders cards, handles filtering & search
 */

// ── SVG Icons ───────────────────────────────────────────────────────
const ICONS = {
  branch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  commit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  dirty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
};

// ── State ───────────────────────────────────────────────────────────
let allProjects = [];
let currentFilter = 'all';

// ── DOM Elements ────────────────────────────────────────────────────
const grid = document.getElementById('projects-grid');
const searchInput = document.getElementById('search-input');
const statsBar = document.getElementById('stats-bar');
const lastUpdatedEl = document.getElementById('last-updated');

// ── Load Data ───────────────────────────────────────────────────────
async function loadData() {
  try {
    const cacheBuster = `?t=${Date.now()}`;
    const res = await fetch(`projects-status.json${cacheBuster}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allProjects = data.projects;

    // Update stats
    document.getElementById('count-total').textContent = data.projectCount;
    document.getElementById('count-active').textContent = data.activeCount;
    document.getElementById('count-idle').textContent = data.idleCount;
    document.getElementById('count-stale').textContent = data.staleCount;

    // Update last updated
    lastUpdatedEl.textContent = `Updated ${formatRelativeTime(data.lastUpdated)}`;

    renderProjects();
  } catch (err) {
    console.error('Failed to load project data:', err);
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Unable to load project data. Run <code>npm run scan</code> first.</p>
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
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p>No projects match your search.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(project => renderCard(project)).join('');
}

function renderCard(project) {
  const { name, emoji, description, stack, status, git, recentActions, lastSession, lastActivity, size } = project;

  // Status badge
  const statusLabel = { active: 'Active', idle: 'Idle', stale: 'Stale', unknown: 'Unknown' }[status] || 'Unknown';

  // Meta tags
  const metaTags = [];
  metaTags.push(`<span class="meta-tag">${ICONS.folder} ${stack}</span>`);
  if (size && size !== 'unknown') {
    metaTags.push(`<span class="meta-tag">${size}</span>`);
  }
  if (git?.isDirty) {
    metaTags.push(`<span class="meta-tag dirty">${ICONS.dirty} ${git.changedFiles} changed</span>`);
  }

  // Git section
  let gitSection = '';
  if (git) {
    const branchName = git.branch.length > 30 ? git.branch.substring(0, 30) + '…' : git.branch;
    gitSection = `
      <div class="git-section">
        <div class="git-branch">${ICONS.branch} <span>${branchName}</span></div>
        <div class="git-commit">
          <span class="git-commit-msg">${escapeHtml(git.lastCommitMessage)}</span>
          <span class="git-commit-date">${git.lastCommitRelative}</span>
        </div>
      </div>
    `;
  }

  // Recent actions (max 3)
  let actionsSection = '';
  const actions = recentActions.slice(0, 3);
  if (actions.length > 0) {
    const actionItems = actions.map(action => {
      const icon = action.type === 'commit' ? 'commit' : 'chat';
      const text = cleanActionText(action.text);
      return `
        <div class="action-item">
          <span class="action-icon ${icon}">${action.type === 'commit' ? '●' : '💬'}</span>
          <span class="action-text">${escapeHtml(text)}</span>
        </div>
      `;
    }).join('');

    actionsSection = `
      <div class="actions-section">
        <div class="actions-title">Recent Activity</div>
        ${actionItems}
      </div>
    `;
  }

  // Footer
  const activityText = lastActivity ? formatRelativeTime(lastActivity) : 'No activity recorded';
  
  let chatLink = '';
  if (lastSession) {
    chatLink = `
      <span class="chat-link" title="Last chat session">
        ${ICONS.chat} Last Chat
      </span>
    `;
  }

  return `
    <article class="project-card" data-status="${status}" data-name="${name.toLowerCase()}">
      <div class="card-header">
        <div class="card-title-group">
          <div class="card-emoji">${emoji}</div>
          <h2 class="card-name">${escapeHtml(name)}</h2>
          <p class="card-description">${escapeHtml(description)}</p>
        </div>
        <span class="status-badge ${status}">
          <span class="status-dot"></span>
          ${statusLabel}
        </span>
      </div>

      <div class="card-meta">
        ${metaTags.join('')}
      </div>

      ${gitSection}
      ${actionsSection}

      <div class="card-footer">
        <span class="last-activity">${activityText}</span>
        ${chatLink}
      </div>
    </article>
  `;
}

// ── Event Handlers ──────────────────────────────────────────────────

// Stats filter
statsBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.stat-item');
  if (!btn) return;

  currentFilter = btn.dataset.filter;

  // Update active state
  document.querySelectorAll('.stat-item').forEach(el => el.classList.remove('active-filter'));
  if (currentFilter !== 'all') {
    btn.classList.add('active-filter');
  } else {
    document.getElementById('stat-total').classList.add('active-filter');
  }

  renderProjects();
});

// Search
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderProjects, 200);
});

// ── Utilities ───────────────────────────────────────────────────────
function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function cleanActionText(text) {
  if (!text) return '';
  // Remove IDE metadata prefixes
  text = text.replace(/^<ide_opened_file>.*?IDE\.\s*/i, '');
  text = text.replace(/^<[^>]+>/, '');
  // Truncate
  if (text.length > 80) text = text.substring(0, 80) + '…';
  return text;
}

// ── Initialize ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  // Set total as default active filter
  document.getElementById('stat-total').classList.add('active-filter');
});
