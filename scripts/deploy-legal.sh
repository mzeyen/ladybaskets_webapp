#!/bin/bash
set -euo pipefail
umask 077
app=/opt/ladybaskets/app
node=/opt/ladybaskets/runtime/bin/node
test "$(realpath "$app")" = /opt/ladybaskets/app
cd "$app"
stamp=$(date +%Y%m%d-%H%M%S)
backup=/var/backups/ladybaskets/legal-$stamp
install -d -m 700 "$backup"
tar -czf "$backup/code.tar.gz" --exclude=./data --exclude=./.git .
systemctl stop ladybaskets-webapp
rollback() {
 result=$?
 if [ "$result" -ne 0 ]; then
  systemctl stop ladybaskets-webapp || true
  tar -xzf "$backup/code.tar.gz" -C "$app"
  if [ -f "$backup/club.sqlite" ]; then
   # The service is stopped; remove sidecars before restoring the snapshot.
   rm -f "$app/data/club.sqlite-wal" "$app/data/club.sqlite-shm"
   cp "$backup/club.sqlite" "$app/data/club.sqlite"
   chown ladybaskets:ladybaskets "$app/data/club.sqlite"
   chmod 600 "$app/data/club.sqlite"
  fi
  systemctl start ladybaskets-webapp || true
  echo "Deployment failed; previous code and database restored from $backup" >&2
 fi
 exit "$result"
}
trap rollback EXIT
BACKUP_DB="$backup/club.sqlite" "$node" --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
db.prepare('VACUUM INTO ?').run(process.env.BACKUP_DB);
db.close();
JS
tar -xzf /opt/ladybaskets/legal-release.tar.gz
"$node" --test tests/*.test.mjs
runuser -u ladybaskets -- "$node" scripts/update-legal-pages.mjs
systemctl start ladybaskets-webapp
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3002/api/session
curl -fsS http://127.0.0.1:3002/seiten/impressum.html | grep -q 'Digitale-Dienste-Gesetz'
curl -fsS http://127.0.0.1:3002/seiten/datenschutz.html | grep -q 'Max-Age=28800'
systemctl is-active ladybaskets-webapp
echo "Legal deployment complete. Backup: $backup"
