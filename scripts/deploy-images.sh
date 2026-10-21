#!/bin/bash
set -euo pipefail
umask 077
app=/opt/ladybaskets/app
node=/opt/ladybaskets/runtime/bin/node
test "$(realpath "$app")" = /opt/ladybaskets/app
cd "$app"
stamp=$(date +%Y%m%d-%H%M%S)
backup=/var/backups/ladybaskets/images-$stamp.tar.gz
tar -czf "$backup" pages.mjs public/style.css public/index.html tests/legal.test.mjs
rollback() {
 result=$?
 if [ "$result" -ne 0 ]; then
  tar -xzf "$backup" -C "$app"
  systemctl restart ladybaskets-webapp || true
  echo "Image deployment failed; previous code restored from $backup" >&2
 fi
 exit "$result"
}
trap rollback EXIT
tar -xzf /opt/ladybaskets/images-release.tar.gz
"$node" --test tests/*.test.mjs
systemctl restart ladybaskets-webapp
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3002/api/session
curl -fsS -o /dev/null http://127.0.0.1:3002/assets/unsplash/basketball-court.jpg
curl -fsS -o /dev/null http://127.0.0.1:3002/assets/unsplash/basketball-training.jpg
curl -fsS -o /dev/null http://127.0.0.1:3002/assets/unsplash/basketball-game.jpg
systemctl is-active ladybaskets-webapp
echo "Image deployment complete. Backup: $backup"
