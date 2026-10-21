#!/bin/bash
set -euo pipefail
umask 022
app=/opt/ladybaskets/app
node=/opt/ladybaskets/runtime/bin/node
export PATH=/opt/ladybaskets/runtime/bin:$PATH
test "$(realpath "$app")" = /opt/ladybaskets/app
stamp=$(date +%Y%m%d-%H%M%S)
stage=/opt/ladybaskets/releases/tiptap-$stamp
backup=/var/backups/ladybaskets/tiptap-$stamp
install -d -m 755 "$stage"
install -d -m 700 "$backup"
tar -xzf /opt/ladybaskets/tiptap-release.tar.gz -C "$stage"
cd "$stage"
# Install native Sharp packages for the server platform, never copy Windows modules.
npm ci --omit=dev --no-audit --no-fund
env -u NODE_ENV -u LOCAL_EDITOR_DEMO -u PUBLIC_ORIGIN -u DB_PATH "$node" --test tests/*.test.mjs
# Ensure modules and bundled assets can be read by the service account.
runuser -u ladybaskets -- "$node" --input-type=module -e "import('sharp').then(()=>console.log('Sharp accessible to service user'))"
systemctl start webserver-backup.service
cd "$app"
tar -czf "$backup/code.tar.gz" --exclude=./data .
promoted=0
rollback() {
 result=$?
 if [ "$result" -ne 0 ] && [ "$promoted" = 1 ]; then
  systemctl stop ladybaskets-webapp || true
  tar -xzf "$backup/code.tar.gz" -C "$app"
  systemctl start ladybaskets-webapp || true
  echo "Tiptap deployment failed; previous code restored from $backup" >&2
 fi
 exit "$result"
}
trap rollback EXIT
systemctl stop ladybaskets-webapp
promoted=1
cp -a "$stage/." "$app/"
systemctl start ladybaskets-webapp
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3002/api/session
curl -fsS -o /dev/null http://127.0.0.1:3002/assets/editor/tiptap.js
curl -fsS -o /dev/null http://127.0.0.1:3002/editor.css
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/editor-demo.html)" = 404
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/api/images)" = 401
systemctl is-active ladybaskets-webapp
echo "Tiptap deployment complete. Backup: $backup"
