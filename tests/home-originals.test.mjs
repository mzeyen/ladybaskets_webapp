import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {initializePages,repairHomeActions} from '../pages.mjs';
import {initializeArticles,importArticles} from '../articles.mjs';

test('Fehlende Aktionslinks und Originalbilder werden ohne Textverlust ergänzt',()=>{
 const folder=mkdtempSync(join(tmpdir(),'ladybaskets-originals-'));
 const path=join(folder,'club.sqlite');
 const db=new DatabaseSync(path);
 try{
  db.exec('CREATE TABLE articles(id INTEGER PRIMARY KEY,title TEXT,category TEXT,body TEXT,format TEXT,status TEXT,date TEXT)');
  initializePages(db,'public',s=>s);initializeArticles(db,s=>s);importArticles(db,s=>s);
  const broken='<div class="actions"><a class="button accent">Komm zum Probetraining <span>↗</span></a><a class="text-link">Entdecke unsere Teams →</a></div>';
  db.prepare("UPDATE pages SET body=? WHERE path='/'").run(broken);
  const entries=JSON.parse(readFileSync('content/home-original-images.json'));
  for(const e of entries){
   const id=db.prepare('SELECT article_id FROM article_imports WHERE source=?').get(e.source).article_id;
   db.prepare('UPDATE articles SET body=? WHERE id=?').run('<p>Eigener Redaktionstext bleibt erhalten.</p>',id);
  }
  const migrate=()=>execFileSync(process.execPath,['scripts/update-home-originals.mjs'],{env:{...process.env,DB_PATH:path},stdio:'pipe'});
  migrate();
  assert.equal(db.prepare("SELECT body FROM pages WHERE path='/'").get().body,repairHomeActions(broken));
  for(const e of entries){
   const row=db.prepare('SELECT body FROM articles JOIN article_imports ON articles.id=article_id WHERE source=?').get(e.source);
   assert.ok(row.body.includes(e.image));assert.ok(row.body.includes('Eigener Redaktionstext bleibt erhalten.'));
  }
  const version=db.prepare("SELECT version FROM pages WHERE path='/'").get().version;
  migrate();assert.equal(db.prepare("SELECT version FROM pages WHERE path='/'").get().version,version);
 }finally{db.close();rmSync(folder,{recursive:true,force:true})}
});
