import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {archiveArticles,initializeArticles,importArticles,importedArticles} from '../articles.mjs';

test('Vollständige Archivtexte für neue und bestehende Installationen',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE articles(id INTEGER PRIMARY KEY,title TEXT,category TEXT,body TEXT,format TEXT,status TEXT,date TEXT)');
  initializeArticles(db,s=>s);
  const rows=db.prepare('SELECT * FROM articles ORDER BY id').all();
  assert.equal(rows.length,3);
  rows.forEach((row,i)=>{
   assert.equal(row.body,archiveArticles[i].body);
   assert.ok(row.body.length>1000);
   assert.equal(row.format,'html');
  });
  const first=archiveArticles[0];
  db.prepare("UPDATE articles SET body=?,format='text' WHERE id=1").run(first.legacyBody);
  db.prepare("UPDATE articles SET body='Redaktionell bearbeitet',format='text' WHERE id=2").run();
  db.prepare('DELETE FROM articles WHERE id=3').run();
  initializeArticles(db,s=>s);
  assert.equal(db.prepare('SELECT body FROM articles WHERE id=1').get().body,first.body);
  assert.equal(db.prepare('SELECT body FROM articles WHERE id=2').get().body,'Redaktionell bearbeitet');
  assert.equal(db.prepare('SELECT count(*) AS n FROM articles').get().n,2);
  initializeArticles(db,s=>s);
  assert.equal(db.prepare('SELECT count(*) AS n FROM articles').get().n,2);
 }finally{db.close()}
});

test('Archivimport vermeidet Duplikate und erhält Bearbeitungen und Löschungen',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE articles(id INTEGER PRIMARY KEY,title TEXT,category TEXT,body TEXT,format TEXT,status TEXT,date TEXT)');
  initializeArticles(db,s=>s);
  db.prepare("UPDATE articles SET body='Eigener Redaktionstext' WHERE id=1").run();
  importArticles(db,s=>s);
  const count=()=>db.prepare('SELECT count(*) AS n FROM articles').get().n;
  assert.equal(count(),importedArticles.length);
  assert.equal(db.prepare('SELECT body FROM articles WHERE id=1').get().body,'Eigener Redaktionstext');
  const row=db.prepare("SELECT article_id FROM article_imports WHERE source='ladybaskets:276'").get();
  db.prepare('DELETE FROM articles WHERE id=?').run(row.article_id);
  importArticles(db,s=>s);
  assert.equal(count(),importedArticles.length-1);
  assert.equal(db.prepare('SELECT body FROM articles WHERE id=1').get().body,'Eigener Redaktionstext');
  assert.equal(db.prepare('SELECT count(*) AS n FROM articles WHERE title=?').get(archiveArticles[2].title).n,1);
  db.exec('DELETE FROM articles');
  initializeArticles(db,s=>s);
  importArticles(db,s=>s);
  assert.equal(count(),0);
 }finally{db.close()}
});
