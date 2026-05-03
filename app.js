/**
 * app.js — מחברת הפרוייקטים
 * טוען projects-status.json, מרנדר hero + grid, מנהל filter/search/drawer.
 */

// ── State ──────────────────────────────────────────────────────────
let allProjects = [];
let currentFilter = 'all';

// ── DOM ────────────────────────────────────────────────────────────
const heroEl = document.getElementById('hero');
const gridEl = document.getElementById('grid');
const filtersEl = document.getElementById('filters');
const searchInput = document.getElementById('search-input');
const subtitleEl = document.getElementById('header-subtitle');
const drawerEl = document.getElementById('drawer');
const drawerBackdropEl = document.getElementById('drawer-backdrop');
const drawerCloseEl = document.getElementById('drawer-close');
const drawerContentEl = document.getElementById('drawer-content');

// ── Hebrew labels ──────────────────────────────────────────────────
const STATUS_HE = {
  live:     'חי',
  building: 'בפיתוח',
  paused:   'מושהה',
  archive:  'ארכיון',
  idea:     'רעיון',
  unknown:  'לא ידוע',
};

const SOURCE_HE = {
  local: 'מקומי',
  cloud: 'ענן',
  both:  'מקומי + ענן',
};

// ── Load data ──────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch(`projects-status.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allProjects = data.projects || [];

    // Update counts
    document.getElementById('count-all').textContent = data.projectCount;
    document.getElementById('count-live').textContent = data.counts?.live ?? 0;
    document.getElementById('count-building').textContent = data.counts?.building ?? 0;
    document.getElementById('count-paused').textContent = data.counts?.paused ?? 0;
    document.getElementById('count-archive').textContent = data.counts?.archive ?? 0;
    document.getElementById('count-idea').textContent = data.counts?.idea ?? 0;

    // Subtitle
    const total = data.projectCount;
    const liveCnt = data.counts?.live ?? 0;
    const upd = data.lastUpdatedHebrew || formatRelative(data.lastUpdated);
    subtitleEl.innerHTML = `
      <span class="total-num">${total}</span> פרוייקטים ·
      <span class="live-num">${liveCnt} חיים</span> ·
      עודכן ${esc(upd)}
    `;

    render();
  } catch (err) {
    console.error('Failed to load:', err);
    gridEl.innerHTML = `
      <div class="empty-state">
        עוד לא נטענו נתונים — הריצי <code>npm run scan</code> קודם.
      </div>
    `;
  }
}

// ── Render ─────────────────────────────────────────────────────────

function render() {
  const query = searchInput.value.toLowerCase().trim();
  const filtered = allProjects.filter(p => {
    const matchFilter = currentFilter === 'all' || p.status === currentFilter;
    const matchSearch = !query ||
      (p.humanName || p.name).toLowerCase().includes(query) ||
      (p.tagline || '').toLowerCase().includes(query) ||
      (p.longDescription || '').toLowerCase().includes(query) ||
      (p.stack || '').toLowerCase().includes(query) ||
      (p.category || '').toLowerCase().includes(query);
    return matchFilter && matchSearch;
  });

  // Hero: only when "all" filter and we have a top project
  const useHero = currentFilter === 'all' && !query && filtered.length > 0;
  const heroProject = useHero ? filtered[0] : null;
  const gridProjects = useHero ? filtered.slice(1) : filtered;

  if (heroProject) {
    heroEl.hidden = false;
    heroEl.innerHTML = renderHero(heroProject);
    heroEl.style.setProperty('--accent', heroProject.accentColor);
    heroEl._project = heroProject;
  } else {
    heroEl.hidden = true;
    heroEl.innerHTML = '';
    heroEl._project = null;
  }

  if (gridProjects.length === 0 && !heroProject) {
    gridEl.innerHTML = `<div class="empty-state">לא נמצאו פרוייקטים תואמים</div>`;
    return;
  }

  gridEl.innerHTML = gridProjects.map((p, i) => renderCard(p, i)).join('');
  // Bind card clicks
  gridEl.querySelectorAll('.card').forEach((el, i) => {
    el.addEventListener('click', () => openDrawer(gridProjects[i]));
  });
}

// ── Hero ───────────────────────────────────────────────────────────

function renderHero(p) {
  const stamp = renderStamp(p);
  const initial = (p.humanName || p.name).charAt(0);

  const polaroidImg = p.screenshot
    ? `<img src="${esc(p.screenshot)}" alt="">`
    : esc(initial);

  return `
    <div class="hero-polaroid-wrap">
      <div class="polaroid">
        <div class="polaroid-image ${p.screenshot ? '' : 'placeholder'}" style="--accent: ${esc(p.accentColor)}; background: ${p.screenshot ? '' : esc(p.accentColor)}">
          ${polaroidImg}
        </div>
        <div class="polaroid-caption">${esc(p.humanName || p.name)}</div>
      </div>
    </div>

    <div class="hero-body">
      <div class="hero-label">הפרוייקט הכי פעיל כרגע</div>
      <div class="hero-title-row">
        <h2 class="hero-title">${esc(p.humanName || p.name)}</h2>
        ${stamp}
      </div>
      <p class="hero-tagline">${esc(p.tagline || '')}</p>

      <div class="hero-meta-row">
        ${p.lastActivityHebrew ? `<span>עודכן ${esc(p.lastActivityHebrew)}</span>` : ''}
        ${p.lastActivityHebrew && p.category ? `<span class="dot">·</span>` : ''}
        ${p.category ? `<span>${esc(p.category)}</span>` : ''}
      </div>

      ${p.nextStep ? `
        <div class="sticky-note">
          <div class="sticky-note-label">הצעד הבא</div>
          <div class="sticky-note-text">${esc(p.nextStep)}</div>
        </div>
      ` : ''}

      <div class="hero-actions">
        ${p.liveUrl ? `<a class="hero-action-btn primary" href="${esc(p.liveUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">פתח באתר</a>` : ''}
        ${p.githubUrl ? `<a class="hero-action-btn" href="${esc(p.githubUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">GitHub</a>` : ''}
        <button class="hero-action-btn">פרטים מלאים</button>
      </div>
    </div>
  `;
}

// ── Card ───────────────────────────────────────────────────────────

function renderCard(p, idx) {
  const stamp = renderStamp(p);
  const initial = (p.humanName || p.name).charAt(0);

  const polaroidContent = p.screenshot
    ? `<img src="${esc(p.screenshot)}" alt="">`
    : esc(initial);

  // Subtle randomized rotation per card
  const rotations = ['-0.6deg', '0.4deg', '-0.3deg', '0.7deg', '-0.5deg'];
  const rot = rotations[idx % rotations.length];

  return `
    <article class="card" style="--card-accent: ${esc(p.accentColor)}; transform: rotate(${rot})" data-name="${esc(p.name)}">
      <div class="card-polaroid-wrap">
        <div class="card-polaroid">
          <div class="card-polaroid-img" style="--card-accent: ${esc(p.accentColor)}; background: ${p.screenshot ? '' : esc(p.accentColor)}">
            ${polaroidContent}
          </div>
          <div class="card-polaroid-caption">${esc(p.humanName || p.name)}</div>
        </div>
      </div>

      <div class="card-header">
        <h3 class="card-title">${esc(p.humanName || p.name)}</h3>
        ${stamp}
      </div>

      <p class="card-tagline">${esc(p.tagline || '')}</p>

      ${p.nextStep ? `
        <div class="card-next-step">
          <div class="card-next-step-label">הצעד הבא</div>
          <div class="card-next-step-text">${esc(p.nextStep)}</div>
        </div>
      ` : ''}

      <div class="card-footer">
        <span class="time">${esc(p.lastActivityHebrew || '—')}</span>
        <span class="card-source-mark">${esc(SOURCE_HE[p.source] || '')}</span>
      </div>
    </article>
  `;
}

// ── Stamp ──────────────────────────────────────────────────────────

function renderStamp(p) {
  const cls = p.status || 'unknown';
  const label = STATUS_HE[cls] || STATUS_HE.unknown;
  const dot = cls === 'live' ? `<span class="live-dot"></span>` : '';
  return `<span class="stamp ${cls}">${dot}${label}</span>`;
}

// ── Drawer ─────────────────────────────────────────────────────────

function openDrawer(p) {
  drawerContentEl.innerHTML = renderDrawer(p);
  drawerEl.hidden = false;
  drawerBackdropEl.hidden = false;
  drawerEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  // Focus close for keyboard accessibility
  setTimeout(() => drawerCloseEl.focus(), 100);
}

function closeDrawer() {
  drawerEl.setAttribute('aria-hidden', 'true');
  // Allow CSS exit animation
  drawerEl.style.transition = '';
  drawerEl.style.transform = 'translateX(-100%)';
  setTimeout(() => {
    drawerEl.hidden = true;
    drawerBackdropEl.hidden = true;
    drawerEl.style.transform = '';
    drawerContentEl.innerHTML = '';
    document.body.style.overflow = '';
  }, 360);
}

function renderDrawer(p) {
  const stamp = renderStamp(p);
  const initial = (p.humanName || p.name).charAt(0);
  const polaroidContent = p.screenshot
    ? `<img src="${esc(p.screenshot)}" alt="">`
    : esc(initial);

  // Activity items (cleaned)
  const activity = (p.recentActions || [])
    .filter(a => a.text && !a.text.startsWith('<ide_opened_file>') && !a.text.startsWith('Base directory for this skill'))
    .slice(0, 6)
    .map(a => `
      <div class="activity-item">
        <span class="activity-mark ${a.type}">${a.type === 'commit' ? 'COMMIT' : 'CHAT'}</span>
        <span>${esc(cleanText(a.text))}</span>
      </div>
    `).join('');

  // Tech chips
  const chips = [];
  if (p.stack && p.stack !== 'Unknown') {
    p.stack.split(' + ').forEach(s => chips.push(`<span class="tech-chip">${esc(s)}</span>`));
  }
  if (p.size && p.size !== 'unknown' && p.size !== 'cloud') {
    chips.push(`<span class="tech-chip">${esc(p.size)}</span>`);
  }
  if (p.git?.isDirty) {
    chips.push(`<span class="tech-chip dirty">${p.git.changedFiles} files dirty</span>`);
  }

  // Git block
  let gitBlock = '';
  if (p.git && p.git.lastCommitMessage) {
    gitBlock = `
      <div class="drawer-section">
        <div class="drawer-section-label">Git</div>
        <div class="git-line">
          <span><span class="git-branch">${esc(p.git.branch || '')}</span> · ${esc(p.git.lastCommitHebrew || p.git.lastCommitRelative || '')}</span>
          <span>"${esc(p.git.lastCommitMessage)}"</span>
        </div>
      </div>
    `;
  }

  // Links
  const links = [];
  if (p.liveUrl) {
    links.push(`<a class="drawer-link primary" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">פתח באתר ↗</a>`);
  }
  if (p.githubUrl) {
    links.push(`<a class="drawer-link" href="${esc(p.githubUrl)}" target="_blank" rel="noopener">GitHub ↗</a>`);
  }
  if (p.lastSession?.sessionId) {
    // Best-effort deep link to claude
    links.push(`<a class="drawer-link" href="cursor://anysphere.cursor-deeplink/file?path=/Users/rannsegal/Claude/${encodeURIComponent(p.name)}">פתח בעורך ↗</a>`);
  }

  return `
    <div class="drawer-polaroid-wrap">
      <div class="drawer-polaroid">
        <div class="drawer-polaroid-img" style="--accent: ${esc(p.accentColor)}; background: ${p.screenshot ? '' : esc(p.accentColor)}">
          ${polaroidContent}
        </div>
        <div class="drawer-polaroid-caption">${esc(p.humanName || p.name)}</div>
      </div>
    </div>

    <div class="drawer-title-row">
      <h2 class="drawer-title">${esc(p.humanName || p.name)}</h2>
      ${stamp}
    </div>

    <p class="drawer-tagline">${esc(p.tagline || '')}</p>

    ${p.nextStep ? `
      <div class="drawer-next-step">
        <div class="drawer-next-step-label">הצעד הבא</div>
        <div class="drawer-next-step-text">${esc(p.nextStep)}</div>
      </div>
    ` : ''}

    ${p.longDescription ? `
      <div class="drawer-section">
        <div class="drawer-section-label">סיפור הפרוייקט</div>
        <p class="drawer-text">${esc(p.longDescription)}</p>
      </div>
    ` : ''}

    ${links.length > 0 ? `
      <div class="drawer-section">
        <div class="drawer-section-label">קישורים</div>
        <div class="drawer-links">${links.join('')}</div>
      </div>
    ` : ''}

    ${chips.length > 0 ? `
      <div class="drawer-section">
        <div class="drawer-section-label">פרטים טכניים</div>
        <div class="tech-chips">${chips.join('')}</div>
      </div>
    ` : ''}

    ${gitBlock}

    ${activity ? `
      <div class="drawer-section">
        <div class="drawer-section-label">פעילות אחרונה</div>
        <div class="activity-list">${activity}</div>
      </div>
    ` : ''}

    <div class="drawer-section">
      <div class="drawer-section-label">מטא</div>
      <div class="tech-chips">
        <span class="tech-chip">${esc(SOURCE_HE[p.source] || p.source || '')}</span>
        ${p.category ? `<span class="tech-chip">${esc(p.category)}</span>` : ''}
        ${p.lastActivityHebrew ? `<span class="tech-chip">${esc(p.lastActivityHebrew)}</span>` : ''}
      </div>
    </div>
  `;
}

// ── Events ─────────────────────────────────────────────────────────

filtersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-pill');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  filtersEl.querySelectorAll('.filter-pill').forEach(el => el.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');
  render();
});

let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(render, 150);
});

drawerCloseEl.addEventListener('click', closeDrawer);
drawerBackdropEl.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !drawerEl.hidden) closeDrawer();
});

heroEl.addEventListener('click', (e) => {
  // Links open in new tab; only intercept everything else (incl. "פרטים מלאים" button)
  if (e.target.closest('a')) return;
  if (heroEl._project) openDrawer(heroEl._project);
});

// ── Utilities ──────────────────────────────────────────────────────

function esc(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function cleanText(t) {
  if (!t) return '';
  return t.replace(/^<[^>]+>/, '').trim();
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'הרגע';
  if (mins < 60) return `לפני ${mins} דקות`;
  if (hrs < 24) return hrs === 1 ? 'לפני שעה' : `לפני ${hrs} שעות`;
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

// ── Init ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadData);
