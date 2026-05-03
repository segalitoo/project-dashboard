#!/usr/bin/env node

/**
 * fetch-github-repos.mjs
 * Fetches all repos for the authenticated GitHub user and writes
 * to github-cloud-projects.json. Used by scan-projects.mjs to merge
 * cloud-only projects into the dashboard.
 *
 * Requires: GITHUB_TOKEN env var (read-only repo scope is enough).
 * Reads .env.local automatically if present.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = resolve(__dirname, 'github-cloud-projects.json');
const ENV_FILE = resolve(__dirname, '.env.local');

// ── Load .env.local manually (no dotenv dep) ───────────────────────
function loadEnvLocal() {
  if (!existsSync(ENV_FILE)) return;
  const content = readFileSync(ENV_FILE, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.warn('⚠️  GITHUB_TOKEN not set. Skipping GitHub fetch.');
  console.warn('   Create .env.local with: GITHUB_TOKEN=ghp_...');
  // Write empty file so scan-projects can still run
  writeFileSync(OUTPUT_FILE, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    repos: [],
    note: 'GITHUB_TOKEN not set - empty result'
  }, null, 2));
  process.exit(0);
}

async function fetchAllRepos() {
  const repos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=pushed&affiliation=owner`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'project-dashboard'
      }
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body}`);
    }

    const batch = await res.json();
    if (batch.length === 0) break;

    for (const r of batch) {
      repos.push({
        name: r.name,
        fullName: r.full_name,
        description: r.description,
        url: r.html_url,
        homepage: r.homepage,
        language: r.language,
        pushedAt: r.pushed_at,
        updatedAt: r.updated_at,
        createdAt: r.created_at,
        isPrivate: r.private,
        isFork: r.fork,
        isArchived: r.archived,
        stars: r.stargazers_count,
        defaultBranch: r.default_branch,
      });
    }

    if (batch.length < perPage) break;
    page++;
  }

  return repos;
}

async function main() {
  console.log('🐙 Fetching GitHub repos...');
  try {
    const repos = await fetchAllRepos();
    const output = {
      fetchedAt: new Date().toISOString(),
      count: repos.length,
      repos
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Wrote ${repos.length} repos to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('❌ GitHub fetch failed:', err.message);
    // Write empty result instead of failing the build
    writeFileSync(OUTPUT_FILE, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      repos: [],
      error: err.message
    }, null, 2));
    process.exit(0);
  }
}

main();
