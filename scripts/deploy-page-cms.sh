set -eu
cd /opt/ladybaskets/app
tar -czf "/opt/ladybaskets/code-before-page-cms-$(date +%Y%m%d-%H%M%S).tar.gz" --exclude=./data .
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
db.prepare('VACUUM INTO ?').run('/opt/ladybaskets/club-before-page-cms-'+Date.now()+'.sqlite');
db.close();
JS
tar -xzf /opt/ladybaskets/page-cms-release.tar.gz
chown -R ladybaskets:ladybaskets server.mjs auth.mjs pages.mjs public/app.js public/page-admin.js public/pages.css tests README.md scripts
/opt/ladybaskets/runtime/bin/node --test tests/*.test.mjs
systemctl restart ladybaskets-webapp.service
sleep 2
systemctl is-active ladybaskets-webapp.service
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const db=new DatabaseSync('data/club.sqlite');
const manifest=JSON.parse(readFileSync('content/site-migration.json','utf8'));
assert.equal(db.prepare('SELECT count(*) AS n FROM pages').get().n,manifest.pages.length+1);
assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE role='superadmin'").get().n,1);
for(const path of ['/',...manifest.pages.map(p=>p.path)]){
 const response=await fetch('http://127.0.0.1:3001'+path);
 assert.equal(response.status,200,path);
 assert.ok((await response.text()).includes('<main'),path);
}
assert.equal((await fetch('http://127.0.0.1:3001/api/pages')).status,401);
const app=await (await fetch('http://127.0.0.1:3001/app.js')).text();
assert.ok(app.includes('data-tab="pages"'));
console.log(`${manifest.pages.length+1} bearbeitbare Seiten verfügbar; Superadmin erhalten und öffentlicher CMS-Zugriff gesperrt.`);
db.close();
JS
