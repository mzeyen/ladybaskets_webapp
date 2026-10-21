import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

// Explicit content migration: existing CMS text is saved before replacement.
const path=resolve(process.env.DB_PATH||'data/club.sqlite');
const db=new DatabaseSync(path,{open:true});
try{
 const paths=['/seiten/datenschutz.html','/seiten/impressum.html'];
 db.exec('BEGIN IMMEDIATE');
 try{
  const previous=paths.map(p=>db.prepare('SELECT * FROM pages WHERE path=?').get(p)).filter(Boolean);
  const backup=resolve(dirname(path),'legal-backups',Date.now()+'.json');
  mkdirSync(dirname(backup),{recursive:true});
  writeFileSync(backup,JSON.stringify(previous,null,2),{flag:'wx'});
  for(const p of paths){
   const html=readFileSync(resolve('public','.'+p),'utf8');
   const body=html.split('<div class="import-content">')[1]?.split('</div></article></main>')[0];
   if(!body)throw Error('Rechtstext fehlt: '+p);
   const title=p.includes('impressum')?'Impressum':'Datenschutz';
   if(db.prepare('SELECT id FROM pages WHERE path=?').get(p)){
    db.prepare("UPDATE pages SET title=?,body=?,format='html',version=version+1 WHERE path=?").run(title,body,p);
   }else{
    db.prepare("INSERT INTO pages(slug,path,title,body,status,kind,menu_visible) VALUES(?,?,?,?,'published','page',0)").run(p.split('/').at(-1).replace('.html',''),p,title,body);
   }
  }
  db.exec('COMMIT');
  console.log('Rechtstexte aktualisiert. Vorheriger CMS-Inhalt: '+backup);
 }catch(error){db.exec('ROLLBACK');throw error}
}finally{db.close()}
