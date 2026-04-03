#!/usr/bin/env node

/**
 * scan-projects.mjs
 * Scans all local projects in ~/Claude workspace, reads git data,
 * Claude Code sessions, and generates projects-status.json
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

// ── Configuration ──────────────────────────────────────────────────

const WORKSPACE = resolve(homedir(), 'Claude');
const OUTPUT_FILE = resolve(WORKSPACE, 'project-dashboard', 'projects-status.json');
const CLAUDE_PROJECTS_DIR = resolve(homedir(), '.claude', 'projects');
const CLAUDE_SESSIONS_DIR = resolve(homedir(), '.claude', 'sessions');

// Known project metadata (from CLAUDE.md)
const PROJECT_META = {
  'Zoom-for-kids':            { stack: 'TypeScript + React 18 + Vite', description: 'Chrome/Firefox extension for kid-friendly Zoom controls', emoji: '👶' },
  'Payoneer-ad-generator':    { stack: 'TypeScript + React 19 + Vite + Supabase + Gemini', description: 'AI-powered ad generation with image analysis', emoji: '🎨' },
  'shmup-reminder':           { stack: 'TypeScript + React 18 + Vite + Supabase + PWA', description: 'Hebrew RTL task manager with voice input', emoji: '✅' },
  'design-manager-portfolio': { stack: 'Next.js 16 + TypeScript + Tailwind CSS 4', description: 'Personal design portfolio (static content)', emoji: '💼' },
  'Shhh':                     { stack: 'Python 3.9+ + Swift (macOS)', description: 'Live dictation tool with gRPC Speech-to-Text', emoji: '🎙️' },
  'ran-portfolio':            { stack: 'HTML + CSS + vanilla JS', description: 'Freelance portfolio (static site)', emoji: '🌐' },
  'kefel':                    { stack: 'HTML', description: 'Hebrew multiplication table educational tool', emoji: '✖️' },
  'ai-academy-jordan':        { stack: 'Unknown', description: 'AI Academy learning platform', emoji: '🎓' },
  'design-agent':             { stack: 'Unknown', description: 'Design agent project', emoji: '🤖' },
  'Chatgpt-codex':            { stack: 'Unknown', description: 'ChatGPT Codex experiments', emoji: '💬' },
  'yad2':                     { stack: 'Unknown', description: 'Yad2 project', emoji: '🏠' },
  'zoom-kids-ui':             { stack: 'Unknown', description: 'Zoom Kids UI designs', emoji: '🎨' },
};

// Directories to exclude from scanning
const EXCLUDED_DIRS = ['.claude', '.DS_Store', 'project-dashboard', 'node_modules'];

// ── Git Helpers ─────────────────────────────────────────────────────

function getGitInfo(projectPath) {
  const gitDir = join(projectPath, '.git');
  if (!existsSync(gitDir)) return null;

  try {
    const branch = execSync('git branch --show-current 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const lastCommitRaw = execSync('git log -1 --format="%H|%ar|%s|%ai" 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const [hash, relativeDate, message, isoDate] = lastCommitRaw.split('|');

    // Check if working directory is dirty
    const statusOutput = execSync('git status --porcelain 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const isDirty = statusOutput.length > 0;
    const changedFiles = isDirty ? statusOutput.split('\n').length : 0;

    // Get recent commit messages (last 5)
    const recentCommitsRaw = execSync('git log -5 --format="%s" 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim();
    const recentCommits = recentCommitsRaw ? recentCommitsRaw.split('\n') : [];

    return {
      branch: branch || 'HEAD',
      lastCommitHash: hash,
      lastCommitDate: isoDate,
      lastCommitRelative: relativeDate,
      lastCommitMessage: message,
      isDirty,
      changedFiles,
      recentCommits
    };
  } catch {
    return null;
  }
}

// ── Claude Code Session Helpers ────────────────────────────────────

function getClaudeCodeSessions(projectName) {
  // Map project names to their Claude Code project directories
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
          
          // Parse first user message and last message
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
                
                // Check if this session mentions the project
                if (text.toLowerCase().includes(projectName.toLowerCase())) {
                  projectMentioned = true;
                }
              }
              
              if (entry.timestamp) {
                lastTimestamp = entry.timestamp;
              }

              // Check cwd to associate session with project
              if (entry.cwd && entry.cwd.includes(projectName)) {
                projectMentioned = true;
              }
            } catch { /* skip malformed lines */ }
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
        } catch { /* skip unreadable files */ }
      }
    } catch { /* skip unreadable dirs */ }
  }

  // Sort by last activity (newest first)
  sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  return sessions.slice(0, 5); // Return last 5 sessions
}

// ── Utility ─────────────────────────────────────────────────────────

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

function computeStatus(git, sessions) {
  const now = new Date();
  let lastActivity = null;

  // Get most recent activity from git
  if (git?.lastCommitDate) {
    const commitDate = new Date(git.lastCommitDate);
    if (!lastActivity || commitDate > lastActivity) lastActivity = commitDate;
  }

  // Get most recent activity from sessions
  if (sessions.length > 0 && sessions[0].lastActivity) {
    const sessionDate = new Date(sessions[0].lastActivity);
    if (!lastActivity || sessionDate > lastActivity) lastActivity = sessionDate;
  }

  if (!lastActivity) return { status: 'unknown', lastActivity: null };

  const daysSince = (now - lastActivity) / (1000 * 60 * 60 * 24);

  let status;
  if (daysSince <= 3) status = 'active';
  else if (daysSince <= 14) status = 'idle';
  else status = 'stale';

  return { status, lastActivity: lastActivity.toISOString() };
}

function getDirectorySize(dirPath) {
  try {
    const output = execSync(`du -sh "${dirPath}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
    return output.split('\t')[0];
  } catch {
    return 'unknown';
  }
}

function hasPackageJson(dirPath) {
  return existsSync(join(dirPath, 'package.json'));
}

function readProjectDescription(dirPath, projectName) {
  // Try to read from project's own CLAUDE.md
  const claudeMd = join(dirPath, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    try {
      const content = readFileSync(claudeMd, 'utf-8');
      // Extract first meaningful paragraph
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && trimmed.length > 20) {
          return truncate(trimmed, 200);
        }
      }
    } catch { /* fallback to meta */ }
  }

  // Try package.json description
  const pkgJson = join(dirPath, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      if (pkg.description) return pkg.description;
    } catch { /* fallback */ }
  }

  return PROJECT_META[projectName]?.description || 'Local project';
}

function readProjectStack(dirPath, projectName) {
  const meta = PROJECT_META[projectName];
  if (meta && meta.stack !== 'Unknown') return meta.stack;

  // Auto-detect from package.json
  const pkgJson = join(dirPath, 'package.json');
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const stack = [];
      if (deps['typescript'] || deps['ts-node']) stack.push('TypeScript');
      if (deps['react']) stack.push(`React ${deps['react'].replace('^', '').split('.')[0]}`);
      if (deps['next']) stack.push('Next.js');
      if (deps['vite']) stack.push('Vite');
      if (deps['vue']) stack.push('Vue');
      if (deps['@supabase/supabase-js']) stack.push('Supabase');
      return stack.length > 0 ? stack.join(' + ') : 'Node.js';
    } catch { /* fallback */ }
  }

  if (existsSync(join(dirPath, 'requirements.txt'))) return 'Python';
  if (existsSync(join(dirPath, 'index.html')) && !existsSync(join(dirPath, 'package.json'))) return 'HTML/CSS/JS';

  return 'Unknown';
}

// ── Main Scanner ────────────────────────────────────────────────────

function scanProjects() {
  console.log('🔍 Scanning projects in', WORKSPACE);
  
  const entries = readdirSync(WORKSPACE, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_DIRS.includes(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const projectPath = join(WORKSPACE, entry.name);
    const projectName = entry.name;
    const meta = PROJECT_META[projectName] || {};

    console.log(`  📦 ${projectName}...`);

    // Gather data
    const git = getGitInfo(projectPath);
    const sessions = getClaudeCodeSessions(projectName);
    const { status, lastActivity } = computeStatus(git, sessions);
    const description = readProjectDescription(projectPath, projectName);
    const stack = readProjectStack(projectPath, projectName);
    const size = getDirectorySize(projectPath);

    // Build recent actions list from git commits + sessions
    const recentActions = [];
    if (git?.recentCommits) {
      for (const commit of git.recentCommits.slice(0, 3)) {
        recentActions.push({ type: 'commit', text: commit });
      }
    }
    if (sessions.length > 0) {
      for (const session of sessions.slice(0, 2)) {
        if (session.firstMessage) {
          recentActions.push({ type: 'chat', text: session.firstMessage, sessionId: session.sessionId });
        }
      }
    }

    projects.push({
      name: projectName,
      emoji: meta.emoji || '📁',
      description,
      stack,
      status,
      lastActivity,
      size,
      hasGit: !!git,
      git: git ? {
        branch: git.branch,
        lastCommitRelative: git.lastCommitRelative,
        lastCommitMessage: git.lastCommitMessage,
        lastCommitDate: git.lastCommitDate,
        isDirty: git.isDirty,
        changedFiles: git.changedFiles,
      } : null,
      recentActions,
      lastSession: sessions.length > 0 ? {
        sessionId: sessions[0].sessionId,
        lastActivity: sessions[0].lastActivity,
        summary: sessions[0].firstMessage,
      } : null,
    });
  }

  // Sort: active first, then by last activity
  const statusOrder = { active: 0, idle: 1, stale: 2, unknown: 3 };
  projects.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return new Date(b.lastActivity) - new Date(a.lastActivity);
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    projectCount: projects.length,
    activeCount: projects.filter(p => p.status === 'active').length,
    idleCount: projects.filter(p => p.status === 'idle').length,
    staleCount: projects.filter(p => p.status === 'stale').length,
    projects
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ Written ${projects.length} projects to ${OUTPUT_FILE}`);
  console.log(`   Active: ${output.activeCount} | Idle: ${output.idleCount} | Stale: ${output.staleCount}`);
}

scanProjects();
