set -eu
cd /opt/ladybaskets/app
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
db.prepare('VACUUM INTO ?').run('/opt/ladybaskets/club-before-news-'+Date.now()+'.sqlite');
db.close();
JS
tar -czf "/opt/ladybaskets/code-before-news-$(date +%Y%m%d-%H%M%S).tar.gz" server.mjs articles.mjs public/app.js public/style.css content tests README.md
tar -xzf /opt/ladybaskets/news-release.tar.gz
chown -R ladybaskets:ladybaskets server.mjs articles.mjs public/app.js public/style.css content tests README.md scripts
/opt/ladybaskets/runtime/bin/node --test tests/*.test.mjs
systemctl restart ladybaskets-webapp.service
sleep 2
systemctl is-active ladybaskets-webapp.service
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {importedArticles} from './articles.mjs';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
assert.equal(db.prepare('SELECT count(*) AS n FROM article_imports').get().n,importedArticles.length);
const response=await fetch('http://127.0.0.1:3001/api/articles');
assert.equal(response.status,200);
const articles=await response.json();
assert.equal(articles.filter(a=>a.title==='Klar und deutlich').length,1);
assert.ok(articles.some(a=>a.title==='TrainerInnen gesucht'&&a.body.includes('<img')));
console.log(`${articles.length} veröffentlichte Beiträge, ${importedArticles.length} Originalquellen im CMS erfasst.`);
db.close();
JS
