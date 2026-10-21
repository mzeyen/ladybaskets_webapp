#!/bin/bash
set -euo pipefail
umask 077
test "$(id -u)" = 0
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends restic
install -d -m 700 /etc/webserver-backup /var/backups/webserver /var/cache/webserver-backup
install -d -m 755 /usr/local/lib/webserver-backup
install -m 700 /opt/ladybaskets/app/scripts/webserver-backup.py /usr/local/lib/webserver-backup/run.py
if [ ! -s /etc/webserver-backup/password ]; then
 python3 - <<'PY'
import secrets
from pathlib import Path
with Path('/etc/webserver-backup/password').open('x') as f:
    f.write(secrets.token_urlsafe(48) + '\n')
PY
fi
chmod 600 /etc/webserver-backup/password
if [ ! -f /var/backups/webserver/repository/config ]; then
 restic --repo /var/backups/webserver/repository --password-file /etc/webserver-backup/password init
fi
for action in backup check restore-test watchdog; do
 cat > "/etc/systemd/system/webserver-$action.service" <<EOF
[Unit]
Description=Webserver encrypted local backup: $action
After=postgresql.service
[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/bin/python3 /usr/local/lib/webserver-backup/run.py $action
Environment=RESTIC_CACHE_DIR=/var/cache/webserver-backup
CacheDirectory=webserver-backup
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/backups/webserver /var/cache/webserver-backup
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
TimeoutStartSec=2h
EOF
done
write_timer() {
 name=$1
 calendar=$2
 cat > "/etc/systemd/system/webserver-$name.timer" <<EOF
[Unit]
Description=Scheduled webserver $name
[Timer]
OnCalendar=$calendar
Persistent=true
AccuracySec=1min
[Install]
WantedBy=timers.target
EOF
}
write_timer backup '*-*-* 00,06,12,18:15:00 Europe/Berlin'
write_timer check 'Sun *-*-* 03:30:00 Europe/Berlin'
write_timer restore-test '*-*-01 04:30:00 Europe/Berlin'
write_timer watchdog '*-*-* *:45:00 Europe/Berlin'
chmod 644 /etc/systemd/system/webserver-{backup,check,restore-test,watchdog}.{service,timer}
systemctl daemon-reload
systemctl start webserver-backup.service
systemctl start webserver-restore-test.service
systemctl enable --now webserver-{backup,check,restore-test,watchdog}.timer
systemctl start webserver-watchdog.service
systemctl list-timers 'webserver-*' --no-pager
echo 'Local encrypted server backups configured. No external storage or external alerting configured.'
