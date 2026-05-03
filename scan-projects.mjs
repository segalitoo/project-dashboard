#!/usr/bin/env node

/**
 * scan-projects.mjs
 * Scans local projects in ~/Claude, merges with projects-meta.json (manual)
 * and github-cloud-projects.json (auto), checks live URLs, computes status,
 * and writes projects-status.json.
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// ── Paths ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(homedir(), 'Claude');
const OUTPUT_FILE = resolve(__dirname, 'projects-status.json');
const META_FILE = resolve(__dirname, 'projects-meta.json');
const CLOUD_FILE = resolve(__dirname, 'github-cloud-projects.json');
const CLAUDE_PROJECTS_DIR = resolve(homedir(), '.claude', 'projects');

const EXCLUDED_DIRS = ['.claude', '.DS_Store', 'project-dashboard', 'node_modules'];

// ── Default emojis by detected stack ──────────────────────────────

const STACK_EMOJI = {
  python: '🐍', node: '🟢', react: '⚛️', next: '▲',
  vite: '⚡', supabase: '🗄️', html: '📄', swift: '🍎',
};

// ── Args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const SKIP_LIVE_CHECK = args.includes('--no-live-check');

// ── Git Helpers ───────────────────────────────────────────────────

function getGitInfo(projectPath) {
  const gitDir = join(projectPath, '.git');
  if (!existsSync(gitDir)) return null;

  try {
    const branch = execSync('git branch --show-current 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const lastCommitRaw = execSync('git log -1 --format="%H|%ar|%s|%ai" 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const [hash, relativeDate, message, isoDate] = lastCommitRaw.split('|');

    const statusOutput = execSync('git status --porcelain 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const isDirty = statusOutput.length > 0;
    const changedFiles = isDirty ? statusOutput.split('\n').length : 0;

    const recentCommitsRaw = execSync('git log -5 --format="%s" 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const recentCommits = recentCommitsRaw ? recentCommitsRaw.split('\n') : [];

    // Try to extract GitHub URL from origin
    let githubUrl = null;
    try {
      const remote = execSync('git remote get-url origin 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
      if (remote.includes('github.com')) {
        githubUrl = remote
          .replace(/^git@github\.com:/, 'https://github.com/')
          .replace(/\.git$/, '');
      }
    } catch { /* no remote */ }

    return {
      branch: branch || 'HEAD',
      lastCommitHash: hash,
      lastCommitDate: isoDate,
      lastCommitRelative: relativeDate,
      lastCommitMessage: message,
      isDirty,
      changedFiles,
      recentCommits,
      githubUrl,
    };
  } catch {
    return null;
  }
}

// ── Claude Sessions ───────────────────────────────────────────────

function getClaudeCodeSessions(projectName) {
  const possibleDirs = [
    join(CLAUDE_PROJECTS_DIR, `-Users-rannsegal-Claude`),
    join(CLAUDE_PROJECTS_DIR, `-Users-rannsegal-Claude-${projectName}`),
  ];

  const sessions = [];

  for (const dir of possibleDirs) {
    if (!existsSync(dir)) continue;

    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const filePath = join(dir, file);
        const sessionId = file.replace('.jsonl', '');

        try {
          const stat = statSync(filePath);
          const content = readFileSync(filePath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim());

          let firstUserMessage = null;
          let lastMessage = null;
          let lastTimestamp = null;
          let projectMentioned = false;

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);

              if (entry.type === 'user' && entry.message?.content) {
                const text = entry.message.content
                  .filter(c => c.type === 'text')
                  .map(c => c.text)
                  .join(' ');

                if (!firstUserMessage) firstUserMessage = text;
                lastMessage = text;

                if (text.toLowerCase().includes(projectName.toLowerCase())) {
                  projectMentioned = true;
                }
              }

              if (entry.timestamp) lastTimestamp = entry.timestamp;
              if (entry.cwd && entry.cwd.includes(projectName)) projectMentioned = true;
            } catch { /* skip */ }
          }

          if (projectMentioned && lastTimestamp) {
            sessions.push({
              sessionId,
              lastActivity: lastTimestamp,
              firstMessage: truncate(firstUserMessage, 120),
              lastMessage: truncate(lastMessage, 120),
              modifiedAt: stat.mtime.toISOString(),
            });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  return sessions.slice(0, 5);
}

// ── Utilities ─────────────────────────────────────────────────────

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

function getDirectorySize(dirPath) {
  try {
    return execSync(`du -sh "${dirPath}" 2>/dev/null`, { encoding: 'utf-8' }).trim().split('\t')[0];
  } catch {
    return 'unknown';
  }
}

function detectStack(dirPath) {
  const pkgJson = join(dirPath, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const stack = [];
      if (deps['typescript'] || deps['ts-node']) stack.push('TypeScript');
      if (deps['next']) stack.push('Next.js');
      else if (deps['react']) stack.push(`React ${(deps['react'] || '').replace('^', '').split('.')[0]}`);
      if (deps['vite']) stack.push('Vite');
      if (deps['vue']) stack.push('Vue');
      if (deps['@supabase/supabase-js']) stack.push('Supabase');
      return stack.length > 0 ? stack.join(' + ') : 'Node.js';
    } catch { /* fallback */ }
  }
  if (existsSync(join(dirPath, 'requirements.txt'))) return 'Python';
  if (existsSync(join(dirPath, 'index.html')) && !existsSync(pkgJson)) return 'HTML/CSS/JS';
  return 'Unknown';
}

function fallbackDescription(dirPath) {
  const claudeMd = join(dirPath, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    try {
      const content = readFileSync(claudeMd, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') &&
            !trimmed.startsWith('>') && !trimmed.startsWith('-') && trimmed.length > 25) {
          return truncate(trimmed, 180);
        }
      }
    } catch { /* skip */ }
  }
  const pkgJson = join(dirPath, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      if (pkg.description) return pkg.description;
    } catch { /* skip */ }
  }
  return null;
}

// ── Status Computation (new 5-state model) ────────────────────────

function computeStatus({ git, sessions, isLive, manualStatus, hasGit, hasContent }) {
  if (manualStatus) return { status: manualStatus, lastActivity: latestActivity(git, sessions) };

  // No code at all → idea
  if (!hasGit && !hasContent && (!sessions || sessions.length === 0)) {
    return { status: 'idea', lastActivity: null };
  }

  const lastActivity = latestActivity(git, sessions);
  if (!lastActivity) return { status: 'idea', lastActivity: null };

  const daysSince = (Date.now() - new Date(lastActivity).getTime()) / 86400000;

  let status;
  if (daysSince <= 7) status = 'building';
  else if (daysSince <= 30) status = 'paused';
  else status = 'archive';

  // Live overrides — but only if also has activity (otherwise live URL is dead-deploy)
  if (isLive) {
    if (status === 'archive') return { status: 'live', lastActivity };
    return { status: 'live', subStatus: status, lastActivity };
  }

  return { status, lastActivity };
}

function latestActivity(git, sessions) {
  let latest = null;
  if (git?.lastCommitDate) {
    const d = new Date(git.lastCommitDate);
    if (!latest || d > latest) latest = d;
  }
  if (sessions?.[0]?.lastActivity) {
    const d = new Date(sessions[0].lastActivity);
    if (!latest || d > latest) latest = d;
  }
  return latest ? latest.toISOString() : null;
}

// ── Hebrew relative time ──────────────────────────────────────────

function toHebrewRelative(isoDate) {
  if (!isoDate) return '';
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diff = now - then;

  const min = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (min < 1) return 'הרגע';
  if (min < 60) return `לפני ${min} דקות`;
  if (hrs < 24) return hrs === 1 ? 'לפני שעה' : `לפני ${hrs} שעות`;
  if (days === 1) return 'אתמול';
  if (days === 2) return 'שלשום';
  if (days <= 6) return `לפני ${days} ימים`;
  if (days <= 13) return 'השבוע';
  if (weeks <= 3) return `לפני ${weeks} שבועות`;
  if (months === 1) return 'לפני חודש';
  if (months <= 3) return `לפני ${months} חודשים`;
  if (months <= 6) return 'לפני כחצי שנה';
  if (months < 12) return `לפני ${months} חודשים`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'לפני שנה' : `לפני ${years} שנים`;
}

// ── Live URL Check ────────────────────────────────────────────────

async function checkLive(url) {
  if (!url || SKIP_LIVE_CHECK) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'project-dashboard-live-check' },
    });
    clearTimeout(timeout);
    return res.ok || res.status === 405; // some hosts reject HEAD; treat 405 as alive
  } catch {
    return false;
  }
}

// ── Color palette for auto-accent ─────────────────────────────────

const ACCENT_PALETTE = [
  '#8b3a2e', '#3d5a3d', '#a87432', '#3a4a6b',
  '#c9885f', '#8b3a8e', '#2d5f7f', '#1a4d4d',
  '#a06b9e', '#b85f5f', '#d4a052', '#7a8a3a',
  '#5f7fa8', '#5f9d7f',
];

function hashAccent(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length];
}

// ── Load meta + cloud sources ────────────────────────────────────

function loadMeta() {
  if (!existsSync(META_FILE)) return {};
  try {
    const data = JSON.parse(readFileSync(META_FILE, 'utf-8'));
    return data.projects || {};
  } catch (err) {
    console.warn('⚠️  projects-meta.json invalid:', err.message);
    return {};
  }
}

function loadCloud() {
  if (!existsSync(CLOUD_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(CLOUD_FILE, 'utf-8'));
    return data.repos || [];
  } catch {
    return [];
  }
}

// ── Recent actions cleanup ────────────────────────────────────────

function buildRecentActions(git, sessions) {
  const actions = [];
  if (git?.recentCommits) {
    for (const commit of git.recentCommits.slice(0, 3)) {
      actions.push({ type: 'commit', text: commit });
    }
  }
  if (sessions?.length > 0) {
    for (const session of sessions.slice(0, 2)) {
      const text = session.firstMessage;
      if (text && !text.startsWith('<ide_opened_file>') && !text.startsWith('Base directory for this skill')) {
        actions.push({ type: 'chat', text, sessionId: session.sessionId });
      }
    }
  }
  return actions;
}

// ── Main scanner ──────────────────────────────────────────────────

async function scanProjects() {
  console.log('🔍 Scanning projects in', WORKSPACE);

  const meta = loadMeta();
  const cloudRepos = loadCloud();
  const projects = [];
  const seenNames = new Set();

  // Pass 1: local directories
  const entries = existsSync(WORKSPACE)
    ? readdirSync(WORKSPACE, { withFileTypes: true })
    : [];

  if (entries.length === 0 && !existsSync(WORKSPACE)) {
    console.log(`  ⚠️  ${WORKSPACE} not found — skipping local scan`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_DIRS.includes(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const projectPath = join(WORKSPACE, entry.name);
    const projectName = entry.name;
    const projectMeta = meta[projectName] || {};

    console.log(`  📦 ${projectName}...`);
    seenNames.add(projectName);

    const git = getGitInfo(projectPath);
    const sessions = getClaudeCodeSessions(projectName);
    const stack = detectStack(projectPath);
    const size = getDirectorySize(projectPath);
    const fallbackDesc = fallbackDescription(projectPath);

    const liveUrl = projectMeta.liveUrl || null;
    const isLive = await checkLive(liveUrl);

    const githubUrl = projectMeta.githubUrl || git?.githubUrl || null;
    const hasContent = size && size !== 'unknown' && !size.endsWith('K') ||
      (size && parseInt(size) > 100); // non-trivial size

    const { status, subStatus, lastActivity } = computeStatus({
      git, sessions, isLive,
      manualStatus: projectMeta.status,
      hasGit: !!git,
      hasContent,
    });

    projects.push({
      name: projectName,
      humanName: projectMeta.humanName || projectName,
      tagline: projectMeta.tagline || fallbackDesc || stack,
      longDescription: projectMeta.longDescription || fallbackDesc || `פרוייקט ב-${stack}`,
      nextStep: projectMeta.nextStep || null,
      category: projectMeta.category || null,
      accentColor: projectMeta.accentColor || hashAccent(projectName),
      screenshot: projectMeta.screenshot || null,
      stack,
      status,
      subStatus: subStatus || null,
      lastActivity,
      lastActivityHebrew: toHebrewRelative(lastActivity),
      size,
      isLive,
      liveUrl,
      githubUrl,
      source: 'local',
      hasGit: !!git,
      git: git ? {
        branch: git.branch,
        lastCommitRelative: git.lastCommitRelative,
        lastCommitMessage: git.lastCommitMessage,
        lastCommitDate: git.lastCommitDate,
        lastCommitHebrew: toHebrewRelative(git.lastCommitDate),
        isDirty: git.isDirty,
        changedFiles: git.changedFiles,
      } : null,
      recentActions: buildRecentActions(git, sessions),
      lastSession: sessions.length > 0 ? {
        sessionId: sessions[0].sessionId,
        lastActivity: sessions[0].lastActivity,
        summary: sessions[0].firstMessage,
      } : null,
    });
  }

  // Pass 2: cloud-only meta entries (manually marked)
  for (const [name, m] of Object.entries(meta)) {
    if (seenNames.has(name)) continue;
    if (!m.cloudOnly) continue;

    console.log(`  ☁️  ${name} (cloud-only meta)`);
    const isLive = await checkLive(m.liveUrl);

    projects.push({
      name,
      humanName: m.humanName || name,
      tagline: m.tagline || '',
      longDescription: m.longDescription || '',
      nextStep: m.nextStep || null,
      category: m.category || null,
      accentColor: m.accentColor || hashAccent(name),
      screenshot: m.screenshot || null,
      stack: m.stack || 'Cloud',
      status: m.status || (isLive ? 'live' : 'paused'),
      subStatus: null,
      lastActivity: null,
      lastActivityHebrew: '',
      size: 'cloud',
      isLive,
      liveUrl: m.liveUrl || null,
      githubUrl: m.githubUrl || null,
      source: 'cloud',
      hasGit: false,
      git: null,
      recentActions: [],
      lastSession: null,
    });
    seenNames.add(name);
  }

  // Pass 3: GitHub repos not yet seen (auto-discovered, no manual meta)
  for (const repo of cloudRepos) {
    if (seenNames.has(repo.name)) {
      // Already exists locally — augment with live URL from homepage if missing
      const existing = projects.find(p => p.name === repo.name);
      if (existing) {
        if (!existing.githubUrl) existing.githubUrl = repo.url;
        if (!existing.liveUrl && repo.homepage) {
          existing.liveUrl = repo.homepage;
          existing.isLive = await checkLive(repo.homepage);
        }
        existing.source = existing.source === 'local' ? 'both' : existing.source;
      }
      continue;
    }

    if (repo.isFork || repo.isArchived) continue; // skip forks and archives by default

    console.log(`  ☁️  ${repo.name} (cloud-only github)`);
    const isLive = await checkLive(repo.homepage);

    const daysSincePush = repo.pushedAt
      ? (Date.now() - new Date(repo.pushedAt).getTime()) / 86400000
      : Infinity;

    let status;
    if (isLive) status = 'live';
    else if (daysSincePush <= 7) status = 'building';
    else if (daysSincePush <= 30) status = 'paused';
    else status = 'archive';

    projects.push({
      name: repo.name,
      humanName: repo.name,
      tagline: repo.description || `repo ענן: ${repo.name}`,
      longDescription: repo.description || '',
      nextStep: null,
      category: null,
      accentColor: hashAccent(repo.name),
      screenshot: null,
      stack: repo.language || 'Unknown',
      status,
      subStatus: null,
      lastActivity: repo.pushedAt,
      lastActivityHebrew: toHebrewRelative(repo.pushedAt),
      size: 'cloud',
      isLive,
      liveUrl: repo.homepage || null,
      githubUrl: repo.url,
      source: 'cloud',
      hasGit: true,
      git: {
        branch: repo.defaultBranch,
        lastCommitRelative: '',
        lastCommitMessage: '',
        lastCommitDate: repo.pushedAt,
        lastCommitHebrew: toHebrewRelative(repo.pushedAt),
        isDirty: false,
        changedFiles: 0,
      },
      recentActions: [],
      lastSession: null,
    });
  }

  // Sort: live first, then building, paused, archive, idea
  const statusOrder = { live: 0, building: 1, paused: 2, archive: 3, idea: 4, unknown: 5 };
  projects.sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return new Date(b.lastActivity) - new Date(a.lastActivity);
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    lastUpdatedHebrew: toHebrewRelative(new Date().toISOString()),
    projectCount: projects.length,
    counts: {
      live: projects.filter(p => p.status === 'live').length,
      building: projects.filter(p => p.status === 'building').length,
      paused: projects.filter(p => p.status === 'paused').length,
      archive: projects.filter(p => p.status === 'archive').length,
      idea: projects.filter(p => p.status === 'idea').length,
    },
    projects
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ Wrote ${projects.length} projects → ${OUTPUT_FILE}`);
  console.log(`   live: ${output.counts.live} · building: ${output.counts.building} · paused: ${output.counts.paused} · archive: ${output.counts.archive} · idea: ${output.counts.idea}`);
}

scanProjects().catch(err => {
  console.error('❌ Scan failed:', err);
  process.exit(1);
});
