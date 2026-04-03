#!/bin/bash
# update-dashboard.sh — Runs scanner and pushes to GitHub
# Used by the macOS LaunchAgent for automatic updates

set -e

# Ensure Node is available
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

DASHBOARD_DIR="$HOME/Claude/project-dashboard"
LOG_FILE="$DASHBOARD_DIR/scan.log"

echo "$(date): Starting scan..." >> "$LOG_FILE"

cd "$DASHBOARD_DIR"

# Run scanner
node scan-projects.mjs >> "$LOG_FILE" 2>&1

# Check if there are changes
if git diff --quiet projects-status.json 2>/dev/null; then
  echo "$(date): No changes detected, skipping push." >> "$LOG_FILE"
else
  git add projects-status.json
  git commit -m "chore: auto-update project statuses — $(date '+%Y-%m-%d %H:%M')" >> "$LOG_FILE" 2>&1
  git push >> "$LOG_FILE" 2>&1
  echo "$(date): Push complete." >> "$LOG_FILE"
fi

echo "$(date): Done." >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
