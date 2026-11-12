#!/usr/bin/env bash
# Publie l'application construite sur la branche « hostinger » ; Hostinger la redéploie automatiquement.
# Aucun secret n'est publié : la configuration de la base reste sur le serveur (écran d'installation).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
npm run build
test ! -e dist/api/config.php || { echo "dist/api/config.php ne doit pas être publié" >&2; exit 1; }
WT="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git fetch -q origin hostinger
git worktree add -q --detach "$WT" origin/hostinger
cd "$WT"
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name README.md -exec rm -rf {} +
cp -r "$ROOT/dist/." .
git add -A
if git diff --cached --quiet; then echo "Rien de nouveau à publier"; exit 0; fi
git commit -q -m "chore: publication — $(git -C "$ROOT" log -1 --format='%h %s')"
git push -q origin HEAD:hostinger
echo "Publié : Hostinger redéploie transcash.bookline.digital automatiquement."
