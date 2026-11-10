#!/usr/bin/env bash
# =============================================================
# Purge historical SQLite database files from every branch and tag.
#
# The database files that were once tracked (data/emberandash.db,
# data/emberandash.db-wal, data/emberandash.db-shm, and a stray copy under
# ember-and-ash/data/) contain one player account (username + bcrypt
# password hash, no email), one saved game, and guest session IDs. This
# script removes them from history.
#
# SAFETY
#   - It never touches your working copy or your real database: it works on
#     a fresh mirror clone in a temporary directory.
#   - It writes a full backup bundle first.
#   - Without --push it only rewrites the temporary mirror and verifies it.
#   - --push force-pushes the rewritten branches. That invalidates every
#     existing clone and changes every commit ID. Only run it with the
#     repository owner's explicit authorisation.
#
# Usage:
#   scripts/security/purge-db-history.sh [--workdir DIR] [--push]
# =============================================================
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
WORK="${TMPDIR:-/tmp}/ember-purge-$$"
PUSH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --workdir) WORK="$2"; shift 2 ;;
    --push) PUSH=1; shift ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
done

PATHS=(data/emberandash.db data/emberandash.db-wal data/emberandash.db-shm \
       ember-and-ash/data/emberandash.db ember-and-ash/data/emberandash.db-wal ember-and-ash/data/emberandash.db-shm)

mkdir -p "$WORK"
echo "== backup"
git -C "$REPO" bundle create "$WORK/backup-before-purge.bundle" --all
git bundle verify "$WORK/backup-before-purge.bundle" >/dev/null
echo "   $WORK/backup-before-purge.bundle"

echo "== mirror clone"
git clone --mirror -q "$(git -C "$REPO" remote get-url origin)" "$WORK/mirror.git"
cd "$WORK/mirror.git"

before=$(git rev-list --all --objects | grep -cE '\.db(-wal|-shm)?$' || true)
echo "   database blobs reachable before: $before"

echo "== rewrite (index filter, all refs)"
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f \
  --index-filter "git rm --cached --ignore-unmatch -q ${PATHS[*]}" \
  --tag-name-filter cat -- --all >/dev/null
git for-each-ref --format='%(refname)' refs/original | xargs -r -n1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now -q

after=$(git rev-list --all --objects | grep -cE '\.db(-wal|-shm)?$' || true)
hashes=$( (git rev-list --all | while read c; do git grep -lIE '[$]2[aby][$][0-9]{2}[$]' "$c" 2>/dev/null || true; done) | wc -l)
echo "   database blobs reachable after:  $after"
echo "   commits containing bcrypt hashes after: $hashes"
[ "$after" = "0" ] || { echo "VERIFY FAILED: database blobs remain"; exit 1; }

echo "== verified. Rewritten refs:"
git for-each-ref --format='   %(refname:short) %(objectname:short)' refs/heads refs/tags

if [ "$PUSH" = "1" ]; then
  echo "== force-pushing (authorised)"
  # Branches and tags only: GitHub's refs/pull/* are read-only and would fail a --mirror push.
  # (A mirror clone refuses refspecs unless its mirror setting is overridden.)
  git -c remote.origin.mirror=false push --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
  echo "   done. Every other clone must re-clone or hard-reset."
else
  echo "== not pushed. To publish (only with authorisation):"
  echo "   cd $WORK/mirror.git && git -c remote.origin.mirror=false push --force origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'"
  echo "   then in your working copy: git fetch origin && git reset --hard origin/<branch>"
fi
