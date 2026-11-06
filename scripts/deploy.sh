#!/usr/bin/env bash
# Build-check, push, wait for GitHub Actions, then download the APK and Windows installer.
# Usage: scripts/deploy.sh ["commit message"]        (needs git, node and the GitHub CLI: gh auth login)
# Env:   REPO=owner/name  BRANCH=main  OUT=dist-download  TAG=v1.2.3 (push a release tag too)
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${REPO:-smartboyhacker66-stack/blind-}"
BRANCH="${BRANCH:-main}"
OUT="${OUT:-dist-download}"
MSG="${1:-Blind Hub update $(date +%Y-%m-%d_%H-%M)}"

for t in git node gh; do command -v "$t" >/dev/null || { echo "Missing tool: $t"; exit 1; }; done
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }

echo "== 1/5 Checks"
node scripts/ci/verify.js

echo "== 2/5 Commit"
[ -d .git ] || { git init -b "$BRANCH"; git remote add origin "https://github.com/$REPO.git"; }
git config user.email >/dev/null 2>&1 || git config user.email "blindhub@users.noreply.github.com"
git config user.name  >/dev/null 2>&1 || git config user.name  "Blind Hub"
git add -A
git diff --cached --quiet || git commit -m "$MSG"

echo "== 3/5 Push (never forced)"
git fetch origin "$BRANCH" 2>/dev/null && git pull --rebase origin "$BRANCH" || true
git push -u origin "HEAD:$BRANCH"
if [ -n "${TAG:-}" ]; then git tag -f "$TAG" && git push origin "$TAG"; fi
SHA=$(git rev-parse HEAD)

echo "== 4/5 Waiting for the build"
RUN=""
for _ in $(seq 1 30); do
  RUN=$(gh run list --repo "$REPO" --workflow build.yml --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)
  [ -n "$RUN" ] && break; sleep 5
done
[ -n "$RUN" ] || { echo "The workflow did not start. Check the Actions tab."; exit 1; }
gh run watch "$RUN" --repo "$REPO" --exit-status

echo "== 5/5 Downloading"
rm -rf "$OUT"; mkdir -p "$OUT"
gh run download "$RUN" --repo "$REPO" --dir "$OUT"
find "$OUT" -type f \( -name '*.apk' -o -name '*.exe' \) -print
echo "Release page: https://github.com/$REPO/releases"
