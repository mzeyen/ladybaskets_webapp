import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import {initializeRoles} from '../auth.mjs';

test('Nur das erste bestehende Administrationskonto wird Superadmin; Passwörter bleiben erhalten',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password TEXT,role TEXT); INSERT INTO users VALUES(1,'owner@example.org','existing-hash','admin'),(2,'admin@example.org','other-hash','admin'),(3,'editor@example.org','editor-hash','editor')");
  initializeRoles(db);initializeRoles(db);
  assert.deepEqual(db.prepare('SELECT role FROM users ORDER BY id').all().map(u=>u.role),['superadmin','admin','editor']);
  assert.equal(db.prepare('SELECT password FROM users WHERE id=1').get().password,'existing-hash');
  assert.throws(()=>db.exec("UPDATE users SET role='superadmin' WHERE id=2"));
 }finally{db.close()}
});

test('Bestehende Konten können sich anmelden; nur der Superadmin legt Redakteure an',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ladybaskets-auth-')),path=join(dir,'club.sqlite');
 const db=new DatabaseSync(path);
 db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password TEXT,role TEXT)');
 const password='existing-password-12345',salt='test-salt';
 const hash=salt+':'+scryptSync(password,salt,64).toString('hex');
 for(const [email,role] of [['owner@example.org','admin'],['admin@example.org','admin'],['editor@example.org','editor']])db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(email,hash,role);
 db.close();
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3097',DB_PATH:path},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Testserver vorzeitig beendet')))});
  const request=async(path,method='GET',data,cookie)=>{
   const response=await fetch('http://127.0.0.1:3097/api/'+path,{method,headers:{Origin:'http://127.0.0.1:3097','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  assert.equal((await request('session')).body.setup,false);
  assert.equal((await request('users','POST',{email:'intruder@example.org',password})).status,401);
  assert.equal((await request('setup','POST',{email:'intruder@example.org',password})).status,403);
  for(const [email,role] of [['owner@example.org','superadmin'],['admin@example.org','admin'],['editor@example.org','editor']]){
   const login=await request('login','POST',{email,password});
   assert.equal(login.status,200,email);assert.ok(login.cookie);
   assert.equal((await request('session','GET',null,login.cookie)).body.user.role,role);
   const create=await request('users','POST',{email:'new-editor@example.org',password,role:'superadmin'},login.cookie);
   assert.equal(create.status,role==='superadmin'?201:403);
   if(role==='superadmin')assert.equal((await request('users','GET',null,login.cookie)).body.find(u=>u.email==='new-editor@example.org').role,'editor');
   await request('logout','POST',null,login.cookie);
   assert.equal((await request('session','GET',null,login.cookie)).body.user,null);
  }
  assert.equal((await request('login','POST',{email:'new-editor@example.org',password})).status,200);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));rmSync(dir,{recursive:true,force:true})}
});
