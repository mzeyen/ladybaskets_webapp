import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {initializePages,renderPage} from '../pages.mjs';

test('Rechtsseiten sind auch im CMS erreichbar; öffentliche Medien laden ohne Drittanbieter',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  const templates=initializePages(db,'public',s=>s);
  for(const path of ['/','/seiten/impressum.html','/seiten/datenschutz.html']){
   const page=db.prepare('SELECT * FROM pages WHERE path=?').get(path);
   assert.equal(page.status,'published');
   const html=renderPage(page,[],templates);
   assert.match(html,/<a href="\/seiten\/impressum.html">Impressum<\/a>/);
   assert.match(html,/<a href="\/seiten\/datenschutz.html">Datenschutz<\/a>/);
  }
  const privacy=db.prepare("SELECT body FROM pages WHERE slug='datenschutz'").get().body;
  assert.doesNotMatch(privacy,/Privacy Shield|Newsletter|Marktforschung/);
  assert.match(privacy,/Max-Age=28800/);
  assert.match(privacy,/§ 25 Abs. 2 Nr. 2 TDDDG/);
  assert.doesNotMatch(readFileSync('public/style.css','utf8'),/https?:\/\//);
  const css=readFileSync('public/style.css','utf8');
  for(const file of ['basketball-court','basketball-training','basketball-game']){
   assert.ok(css.includes(`/assets/unsplash/${file}.jpg`));
   assert.equal(readFileSync(`public/assets/unsplash/${file}.jpg`).subarray(0,3).toString('hex'),'ffd8ff');
  }
  assert.match(css,/\.news-card:nth-child\(3n\+1\)/);
  assert.match(css,/\.news-card:nth-child\(3n\+2\)/);
  assert.match(css,/\.news-card:nth-child\(3n\)/);
  assert.doesNotMatch(readFileSync('public/app.js','utf8'),/\$\('#legal'\)/);
 }finally{db.close()}
});
