# Project Dashboard — מחברת הפרוייקטים

## Project Overview
פורטל אישי שמרכז את כל הפרוייקטים של רן (מקומיים + ענן). עיצוב "quiet luxury / atelier journal" — רקע bone חם, סריף עברי, מון-ספייס דק לתוויות, פריסה דו-טורית: שמאל פרוייקטים, ימין תזכורות אישיות. תוכן בעברית, נפרס ל-GitHub Pages.

## Tech Stack
- **Frontend:** Static HTML + CSS + vanilla JS (no framework)
- **Data:** `projects-status.json` (auto-generated), `projects-meta.json` (manual), `github-cloud-projects.json` (auto)
- **Scanner:** Node.js (no deps, uses native `fetch`)
- **Hosting:** GitHub Pages
- **Automation:** macOS LaunchAgent (every 3 hours) + Claude Code skill

## File Structure
```
project-dashboard/
├── index.html                    # 2-column layout: projects (left) + notes (right)
├── index.css                     # Quiet luxury / atelier journal design system
├── app.js                        # Renders projects list + notes feed (localStorage)
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
- `tagline` — one-sentence Hebrew "what it does" (shown under the project title)
- `longDescription` — paragraph (kept in data, not rendered in current view)
- `nextStep` — single short line (kept in data, not rendered in current view)
- `notes` — multi-line free-form text used as the **seed** for the right-column note. The browser persists edits to `localStorage` under `dashboard-note:<projectName>`; `notes` only appears when no localStorage value exists yet.
- `liveUrl`, `githubUrl`, `screenshot`, `accentColor`, `category`
- `cloudOnly: true` — for projects that only exist on GitHub
- `status` — manual override (e.g. `"idea"` or `"archive"`)

Auto-detected if absent: stack (from `package.json`), description (from `CLAUDE.md`), accentColor (hashed from name).

Link labels in the project entry are auto-derived from `liveUrl`'s hostname: `*.vercel.app → vercel`, `*.netlify.app/.com → netlify`, `*.github.io → pages`, `*.pages.dev → cloudflare`, `*.fly.dev → fly`, anything else → `live`. `githubUrl` always renders as `repo`.

## GitHub Token Setup
1. Create a Classic Personal Access Token with `repo` (read) scope at https://github.com/settings/tokens
2. Save as `.env.local`:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   ```
3. `.env.local` is gitignored.

## Visual Design — "Quiet Luxury / Atelier Journal"
- Warm bone background (`#f3eee4`), single muted clay accent (`#a8624a`), soft hairline dividers (`#d8d1c2`)
- **Frank Ruhl Libre** for Hebrew display, **EB Garamond** for Latin display/italics, **Heebo** for body, **IBM Plex Mono** for tiny uppercase labels
- 2-column layout: LEFT = projects list (index numeral, title, one-sentence tagline, 16:10 thumbnail, mono link row, status dot, relative time). RIGHT = scrollable feed of editable note blocks (one per project).
- No skeuomorphism — no polaroids, no tape, no rotation, no rubber stamps, no paper grain.
- Status indicators: 7px desaturated dot + mono uppercase label. No live-pulse animation.
- Below 980px the columns stack (projects first, notes below).

## Accessibility / Direction
- `dir="rtl"` on `<html>`, Hebrew primary
- English reserved for technical terms (branches, URLs, stack)
- LTR strings (URLs, branches) wrapped in `dir="ltr"` containers

## Key Conventions
- Scanner reads from `~/.claude/projects/` for Claude Code session data
- `projects-status.json` & `github-cloud-projects.json` are checked into git
- LaunchAgent at `~/Library/LaunchAgents/com.rannsegal.project-dashboard.plist` runs `scan:push` every 3 hours
- No build step — flat HTML/CSS/JS
- Notes are **client-side only** (localStorage) and do not sync across devices. Use the `notes` field in `projects-meta.json` if a baseline reminder should be visible on a fresh browser profile.
