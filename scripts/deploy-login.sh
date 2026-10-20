set -eu
cd /opt/ladybaskets/app
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('data/club.sqlite');
db.prepare('VACUUM INTO ?').run('/opt/ladybaskets/club-before-login-'+Date.now()+'.sqlite');
db.close();
JS
tar -czf "/opt/ladybaskets/code-before-login-$(date +%Y%m%d-%H%M%S).tar.gz" server.mjs public/app.js public/index.html tests README.md
tar -xzf /opt/ladybaskets/login-release.tar.gz
chown -R ladybaskets:ladybaskets server.mjs auth.mjs public/app.js public/index.html tests README.md scripts
/opt/ladybaskets/runtime/bin/node --test tests/*.test.mjs
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,unlinkSync} from 'node:fs';
const path='/opt/ladybaskets/provisioning/accounts.json';
const accounts=JSON.parse(readFileSync(path,'utf8'));
if(accounts.filter(a=>a.role==='superadmin').length!==1)throw Error('Genau ein bestehender Superadmin erforderlich');
const db=new DatabaseSync('data/club.sqlite');
if(db.prepare('SELECT id FROM users LIMIT 1').get())throw Error('Server enthält bereits Konten; Übernahme ohne Überschreiben abgebrochen');
db.exec('BEGIN');
try{
 const insert=db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)');
 for(const account of accounts){
  if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.password))throw Error('Unerwartetes Passwortformat');
  insert.run(account.email,account.password,account.role);
 }
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error}
db.close();
console.log(`${accounts.length} bestehendes Konto mit unverändertem Passwort-Hash übernommen.`);
JS
systemctl restart ladybaskets-webapp.service
sleep 2
systemctl is-active ladybaskets-webapp.service
/opt/ladybaskets/runtime/bin/node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync,unlinkSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const path='/opt/ladybaskets/provisioning/accounts.json';
const accounts=JSON.parse(readFileSync(path,'utf8'));
const db=new DatabaseSync('data/club.sqlite');
for(const account of accounts){
 const stored=db.prepare('SELECT password,role FROM users WHERE email=?').get(account.email);
 assert.equal(stored.password,account.password);
 assert.equal(stored.role,account.role);
}
assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE role='superadmin'").get().n,1);
const session=await (await fetch('http://127.0.0.1:3001/api/session')).json();
assert.equal(session.setup,false);assert.equal(session.user,null);
const home=await (await fetch('http://127.0.0.1:3001/')).text();
assert.ok(home.includes('id="login">↗ Anmelden'));
db.close();unlinkSync(path);
console.log('Login verfügbar, bestehendes Passwort erhalten, ein Superadmin, Ersteinrichtung deaktiviert.');
JS
