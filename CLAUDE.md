# Project Dashboard — מחברת הפרוייקטים

## Project Overview
פורטל אישי שמרכז את כל הפרוייקטים של רן (מקומיים + ענן). עיצוב hand-crafted analog (מחברת/יומן עבודה אישי), תוכן בעברית, נפרס ל-GitHub Pages.

## Tech Stack
- **Frontend:** Static HTML + CSS + vanilla JS (no framework)
- **Data:** `projects-status.json` (auto-generated), `projects-meta.json` (manual), `github-cloud-projects.json` (auto)
- **Scanner:** Node.js (no deps, uses native `fetch`)
- **Hosting:** GitHub Pages
- **Automation:** macOS LaunchAgent (every 3 hours) + Claude Code skill

## File Structure
```
project-dashboard/
├── index.html                    # Hero + filters + grid + drawer
├── index.css                     # Hand-crafted analog design system
├── app.js                        # Rendering + drawer + filter/search
├── scan-projects.mjs             # Local scanner + meta merger
├── fetch-github-repos.mjs        # GitHub API fetcher (uses GITHUB_TOKEN)
├── projects-meta.json            # ✋ MANUAL source of truth (Hebrew)
├── projects-status.json          # 🤖 Auto-generated (committed)
├── github-cloud-projects.json    # 🤖 From GitHub API (committed)
├── screenshots/                  # Optional project screenshots
├── .env.local                    # GITHUB_TOKEN (gitignored)
├── package.json
├── CLAUDE.md
└── .github/workflows/deploy.yml  # GitHub Pages deployment
```

## Commands
```bash
npm run fetch:github  # Fetch repos from GitHub API → github-cloud-projects.json
npm run scan          # Fetch GitHub + scan local → projects-status.json
npm run scan:local    # Local-only scan (skip live URL check)
npm run scan:push     # Scan + commit + push to GitHub
npm run serve         # Local dev server on :8000
```

## Status Model (5 states)

| Status     | Meaning                          | Trigger |
|------------|----------------------------------|---------|
| `live`     | Has a working `liveUrl`          | HEAD request returns 200 |
| `building` | Active development               | Activity within 7 days |
| `paused`   | Recently paused                  | Activity 7-30 days ago |
| `archive`  | Stale / archived                 | No activity > 30 days |
| `idea`     | Concept, no code yet             | Empty repo or just meta |

## Data Flow
1. `fetch-github-repos.mjs` reads `GITHUB_TOKEN` from `.env.local`, fetches all owned repos → `github-cloud-projects.json`
2. `scan-projects.mjs`:
   - Scans `~/Claude/*` directories (local projects)
   - Reads git data, Claude Code sessions
   - Merges `projects-meta.json` (manual Hebrew descriptions, URLs, next steps)
   - Adds cloud-only projects from GitHub API not yet seen locally
   - HEAD-requests each `liveUrl` to determine `isLive`
   - Computes 5-state status, Hebrew relative times, accent colors
   - Outputs `projects-status.json`
3. `npm run scan:push` commits and pushes
4. GitHub Pages serves the static site

## Editing projects-meta.json
The most useful manual fields per project:
- `humanName` — Hebrew/display name
- `tagline` — one-line plain Hebrew ("what it does", NOT stack)
- `longDescription` — paragraph for the drawer
- `nextStep` — what to do next, single short line
- `liveUrl`, `githubUrl`, `screenshot`, `accentColor`, `category`
- `cloudOnly: true` — for projects that only exist on GitHub
- `status` — manual override (e.g. `"idea"` or `"archive"`)

Auto-detected if absent: stack (from `package.json`), description (from `CLAUDE.md`), accentColor (hashed from name).

## GitHub Token Setup
1. Create a Classic Personal Access Token with `repo` (read) scope at https://github.com/settings/tokens
2. Save as `.env.local`:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   ```
3. `.env.local` is gitignored.

## Visual Design — "Hand-crafted Analog"
- Paper-cream background (`#f5efe4`) + grain + subtle notebook lines
- **Frank Ruhl Libre** for serif Hebrew titles, **Heebo** for body, **Caveat** for handwritten callouts, **JetBrains Mono** for code/numerals
- Polaroids (slight rotation, yellow tape) for project images
- Sticky notes (yellow with tape) for "next step"
- Rubber-stamp status indicators (slight rotate, opacity 0.85)
- Heartbeat-pulsing dot for live status
- Hero (top featured project) + filterable grid + drawer for details

## Accessibility / Direction
- `dir="rtl"` on `<html>`, Hebrew primary
- English reserved for technical terms (branches, URLs, stack)
- LTR strings (URLs, branches) wrapped in `dir="ltr"` containers

## Key Conventions
- Scanner reads from `~/.claude/projects/` for Claude Code session data
- `projects-status.json` & `github-cloud-projects.json` are checked into git
- LaunchAgent at `~/Library/LaunchAgents/com.rannsegal.project-dashboard.plist` runs `scan:push` every 3 hours
- No build step — flat HTML/CSS/JS
