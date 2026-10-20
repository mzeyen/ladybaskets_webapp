#!/bin/bash
set -euo pipefail
umask 077
app=/opt/ladybaskets/app
test "$(realpath "$app")" = /opt/ladybaskets/app
test -f /etc/letsencrypt/live/ladybaskets-ip/fullchain.pem
cd "$app"
install -d -m 700 /var/backups/ladybaskets
tar -czf "/var/backups/ladybaskets/code-$(date +%Y%m%d-%H%M%S).tar.gz" --exclude=./data .
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
db.prepare('VACUUM INTO ?').run('/var/backups/ladybaskets/club-before-security-'+Date.now()+'.sqlite');db.close();
JS
tar -xzf /opt/ladybaskets/security-release.tar.gz
/opt/ladybaskets/runtime/bin/node --test tests/*.test.mjs
install -d /etc/systemd/system/ladybaskets-webapp.service.d
cat > /etc/systemd/system/ladybaskets-webapp.service.d/security.conf <<'EOF'
[Service]
Environment=HOST=127.0.0.1
Environment=PORT=3002
Environment=COOKIE_SECURE=1
Environment=PUBLIC_ORIGIN=https://91.98.29.130:3001
Environment=TRUST_PROXY=loopback
Environment=ALLOW_SETUP=0
EOF
chmod 644 /etc/systemd/system/ladybaskets-webapp.service.d/security.conf
if ! grep -q 'listen 443 ssl' /etc/nginx/sites-available/ladybaskets; then
cat >> /etc/nginx/sites-available/ladybaskets <<'EOF'

server {
 listen 443 ssl;
 listen 3001 ssl;
 listen [::]:443 ssl;
 listen [::]:3001 ssl;
 server_name 91.98.29.130;
 server_tokens off;
 ssl_certificate /etc/letsencrypt/live/ladybaskets-ip/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/ladybaskets-ip/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 add_header Strict-Transport-Security "max-age=31536000" always;
 client_max_body_size 200k;
 location = /api/setup { return 403; }
 location / {
  proxy_pass http://127.0.0.1:3002;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_connect_timeout 5s;
  proxy_read_timeout 30s;
 }
}
EOF
fi
nginx -t
# Code is administered by root; the running app may write only its private data.
find "$app" -path "$app/data" -prune -o -type d -exec chown root:root {} + -exec chmod 755 {} +
find "$app" -path "$app/data" -prune -o -type f -exec chown root:root {} + -exec chmod 644 {} +
chown -R ladybaskets:ladybaskets "$app/data"
find "$app/data" -type d -exec chmod 700 {} +
find "$app/data" -type f -exec chmod 600 {} +
cat > /etc/systemd/system/ladybaskets-backup.service <<'EOF'
[Unit]
Description=Verified LadyBaskets database backup
[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/opt/ladybaskets/runtime/bin/node /opt/ladybaskets/app/scripts/backup-server.mjs
EOF
cat > /etc/systemd/system/ladybaskets-backup.timer <<'EOF'
[Unit]
Description=Daily LadyBaskets backup
[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
EOF
chmod 644 /etc/systemd/system/ladybaskets-backup.service /etc/systemd/system/ladybaskets-backup.timer
systemctl daemon-reload
systemctl restart ladybaskets-webapp.service
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3002/api/session
# Discard potentially exposed pre-HTTPS sessions; everyone must sign in again.
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');db.exec('DELETE FROM sessions');db.close();
JS
systemctl reload nginx
ufw allow 443/tcp
ufw allow 3001/tcp
systemctl enable --now ladybaskets-backup.timer
systemctl start ladybaskets-backup.service
curl -fsS https://91.98.29.130:3001/api/session
systemctl is-active ladybaskets-webapp nginx ladybaskets-backup.timer
