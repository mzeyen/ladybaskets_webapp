import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const report=JSON.parse(readFileSync('content/site-migration.json','utf8'));
test('Übernommene Seiten, Bilder und Downloads sind intern erreichbar',()=>{
 assert.ok(report.pages.length>=200);
 for(const page of [...report.pages,{path:'/index.html'}]){
  const html=readFileSync('public'+page.path,'utf8');
  assert.ok(html.includes('<main'),page.path);
  for(const [,url] of html.matchAll(/(?:href|src)="(\/(?!\/)[^"]*)"/g)){
   const path=new URL(url,'http://localhost').pathname;
   assert.ok(existsSync('public'+(path==='/'?'/index.html':decodeURIComponent(path))),`${page.path}: ${url}`);
  }
  if(page.path!=='/index.html'){
   assert.doesNotMatch(html,/<script|\son\w+=|javascript:/i);
   assert.ok(html.includes('aria-label="Vereinsseiten"'));
  }
 }
 const teams=readFileSync('public/seiten/teams.html','utf8');
 assert.ok(teams.includes('U10 - SPIELRUNDE'));
 for(const page of report.pages.filter(p=>/\/teams\/lbj-2025-\w+$/.test(p.url))){
  assert.ok(teams.includes(page.path),page.title);
  const html=readFileSync('public'+page.path,'utf8');
  assert.ok(html.includes('basketball-bund.net/widget/widgets/'),page.title);
 }
 const privacy=readFileSync('public/seiten/datenschutz.html','utf8');
 assert.ok(privacy.includes('mailto:post@ladybaskets.de'));
 assert.doesNotMatch(privacy,/Diese E-Mail-Adresse ist vor Spambots/);
 const pdfs=report.assets.filter(a=>a.path.endsWith('.pdf'));
 assert.equal(pdfs.length,7);
 for(const pdf of pdfs)assert.equal(readFileSync('public'+pdf.path).subarray(0,5).toString(),'%PDF-');
});
