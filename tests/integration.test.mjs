import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Anmeldung, Rollen, CMS und Mitgliederdaten',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ladybaskets-test-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3098',DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Testserver vorzeitig beendet')))});
 const request=async(path,method='GET',data,cookie,origin='http://127.0.0.1:3098')=>{const r=await fetch('http://127.0.0.1:3098/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 assert.equal((await request('members')).status,401);
 assert.equal((await request('setup','POST',{email:'admin@example.org',password:'test-password-12345'},null,'https://evil.invalid')).status,403);
 assert.equal((await request('setup','POST',{email:'admin@example.org',password:'test-password-12345'})).status,201);
 assert.equal((await request('setup','POST',{email:'other@example.org',password:'test-password-12345'})).status,409);
 assert.equal((await request('login','POST',{email:'admin@example.org',password:'wrong'})).status,401);
 const admin=await request('login','POST',{email:'admin@example.org',password:'test-password-12345'});assert.equal(admin.status,200);assert.ok(admin.cookie);
 assert.equal((await request('members','POST',{name:'Test Mitglied',email:'member@example.org',team:'Jugend'},admin.cookie)).status,200);
 const members=await request('members','GET',null,admin.cookie);assert.equal(members.body.length,1);
 assert.equal((await request('users','POST',{email:'editor@example.org',password:'editor-password-123'},admin.cookie)).status,201);
 const editor=await request('login','POST',{email:'editor@example.org',password:'editor-password-123'});
 assert.equal((await request('members','GET',null,editor.cookie)).status,403);
 assert.equal((await request('users','GET',null,editor.cookie)).status,403);
 const payload={title:'Testartikel',category:'Vereinsleben',format:'html',status:'draft',body:'<h2 onclick="alert(1)">Hallo</h2><script>alert(1)</script><img src=x onerror=alert(1)><p>Teamgeist</p>'};
 assert.equal((await request('articles','POST',payload,editor.cookie)).status,200);
 assert.ok(!(await request('articles')).body.some(a=>a.title==='Testartikel'));
 const article=(await request('articles','GET',null,editor.cookie)).body.find(a=>a.title==='Testartikel');assert.equal(article.body,'<h2>Hallo</h2><p>Teamgeist</p>');
 assert.equal((await request('articles','POST',{...payload,id:article.id,status:'published'},editor.cookie)).status,200);
 assert.ok((await request('articles')).body.some(a=>a.id===article.id));
 await request('articles/'+article.id,'DELETE',null,editor.cookie);assert.ok(!(await request('articles')).body.some(a=>a.id===article.id));
 await request('members/'+members.body[0].id,'DELETE',null,admin.cookie);assert.equal((await request('members','GET',null,admin.cookie)).body.length,0);
 await request('logout','POST',null,editor.cookie);assert.equal((await request('members','GET',null,editor.cookie)).status,401);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));rmSync(dir,{recursive:true,force:true})}
});
