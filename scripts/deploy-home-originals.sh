#!/bin/bash
set -euo pipefail
umask 077
cd /opt/ladybaskets/app
node=/opt/ladybaskets/runtime/bin/node
systemctl start webserver-backup.service
backup=/var/backups/ladybaskets/home-originals-$(date +%Y%m%d-%H%M%S).tar.gz
tar -czf "$backup" server.mjs pages.mjs public/index.html public/style.css content/articles.json content/imported-news.json content/site-migration.json tests/integration.test.mjs tests/pages-cms.test.mjs
tar -xzf /opt/ladybaskets/home-originals-release.tar.gz
if ! "$node" --test tests/*.test.mjs; then
 tar -xzf "$backup"
 exit 1
fi
runuser -u ladybaskets -- "$node" scripts/update-home-originals.mjs
systemctl restart ladybaskets-webapp
curl --retry 10 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:3002/api/session
systemctl is-active ladybaskets-webapp
echo "Startseitenkorrektur bereitgestellt; bisheriger Code: $backup"
