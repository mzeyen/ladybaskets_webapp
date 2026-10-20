import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('Sicherheitsregressionen: Routing, Kontosperre, Passwörter und Sitzungswiderruf',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ladybaskets-security-')),base='http://127.0.0.1:3094';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3094',HOST:'127.0.0.1',DB_PATH:join(dir,'club.sqlite'),ALLOW_SETUP:'1',COOKIE_SECURE:'1'},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();
 const api=async(path,method='GET',data,cookie)=>{const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')}};
 const credentials={email:'owner@example.org',password:'owner-password-12345'};
 const login=async c=>{const r=await api('login','POST',c);assert.equal(r.status,200);assert.match(r.cookie,/; Secure/);return r.cookie.split(';')[0]};
 try{
  await once(child.stdout,'data');
  assert.equal((await api('setup','POST',credentials)).status,201);
  const owner=await login(credentials);
  const editorCredentials={email:'editor@example.org',password:'editor-password-12345'};
  assert.equal((await api('users','POST',editorCredentials,owner)).status,201);
  const editor=await login(editorCredentials),editor2=await login(editorCredentials);
  const id=(await api('users','GET',null,owner)).body.find(u=>u.role==='editor').id;
  assert.equal((await api('users/'+id,'PATCH',{disabled:true},editor)).status,403);
  assert.equal((await api('users/1','PATCH',{disabled:true},owner)).status,403);
  assert.equal((await api('users/'+id,'PATCH',{disabled:true},owner)).status,200);
  for(const cookie of [editor,editor2])assert.equal((await api('pages','GET',null,cookie)).status,401);
  assert.equal((await api('login','POST',editorCredentials)).status,401);
  assert.equal((await api('users/'+id,'PATCH',{disabled:false,password:'reset-password-12345'},owner)).status,200);
  const resetCredentials={...editorCredentials,password:'reset-password-12345'},reset=await login(resetCredentials);
  assert.equal((await api('account/password','POST',{currentPassword:'wrong',password:'changed-password-12345'},reset)).status,400);
  assert.equal((await api('account/password','POST',{currentPassword:resetCredentials.password,password:'changed-password-12345'},reset)).status,200);
  assert.equal((await api('pages','GET',null,reset)).status,401);
  const changed=await login({...resetCredentials,password:'changed-password-12345'});
  assert.equal((await api('account/sessions','DELETE',null,changed)).status,200);
  assert.equal((await api('pages','GET',null,changed)).status,401);
  const pages=(await api('pages','GET',null,owner)).body;
  const teams=(await api('pages/'+pages.find(p=>p.slug==='teams').id,'GET',null,owner)).body;
  assert.equal((await api('pages','POST',{...teams,status:'draft'},owner)).status,200);
  for(const path of ['/seiten/teams.html','/seiten//teams.html','/seiten/%2fteams.html'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/seiten/teams.html',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/index.html',{method:'POST'})).status,405);
  for(let i=0;i<10;i++)assert.equal((await api('login','POST',{email:'missing@example.org',password:'bad'})).status,401);
  assert.equal((await api('login','POST',{email:'missing@example.org',password:'bad'})).status,429);
  await login(credentials);
 }finally{const stopped=once(child,'exit');child.kill();await stopped;rmSync(dir,{recursive:true,force:true})}
});

test('HTTP-Setup bleibt ohne ausdrückliche Freischaltung gesperrt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ladybaskets-setup-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3093',DB_PATH:join(dir,'club.sqlite'),ALLOW_SETUP:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();
 try{await once(child.stdout,'data');const r=await fetch('http://127.0.0.1:3093/api/setup',{method:'POST',headers:{Origin:'http://127.0.0.1:3093','Content-Type':'application/json'},body:JSON.stringify({email:'intruder@example.org',password:'test-password-12345'})});assert.equal(r.status,403)}
 finally{const stopped=once(child,'exit');child.kill();await stopped;rmSync(dir,{recursive:true,force:true})}
});
