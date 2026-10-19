set -eu
cd /opt/ladybaskets/app
stamp=$(date +%Y%m%d-%H%M%S)
tar -czf "/opt/ladybaskets/code-before-pages-$stamp.tar.gz" --exclude=./data .
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
db.prepare('VACUUM INTO ?').run('/opt/ladybaskets/club-before-pages-'+Date.now()+'.sqlite');
db.close();
JS
tar -xzf /opt/ladybaskets/pages-release.tar.gz
chown -R ladybaskets:ladybaskets public content scripts tests server.mjs articles.mjs README.md package.json
/opt/ladybaskets/runtime/bin/node --test tests/*.test.mjs
systemctl restart ladybaskets-webapp.service
sleep 2
systemctl is-active ladybaskets-webapp.service
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync('content/site-migration.json','utf8'));
for(const page of report.pages){
 const response=await fetch('http://127.0.0.1:3001'+page.path);
 assert.equal(response.status,200,page.path);
 assert.ok((await response.text()).includes('<main'),page.path);
}
for(const file of report.assets){
 const response=await fetch('http://127.0.0.1:3001'+file.path);
 assert.equal(response.status,200,file.path);
 if(file.path.endsWith('.pdf'))assert.equal(response.headers.get('content-type'),'application/pdf');
 await response.arrayBuffer();
}
const home=await fetch('http://127.0.0.1:3001/');
assert.ok((await home.text()).includes('/seiten/teams.html'));
console.log(`${report.pages.length} Seiten und ${report.assets.length} Dateien auf Port 3001 erfolgreich geprüft.`);
JS
