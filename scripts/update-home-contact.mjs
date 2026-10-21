import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const path=resolve(process.env.DB_PATH||'data/club.sqlite');
const db=new DatabaseSync(path);
try{
 db.exec('BEGIN IMMEDIATE');
 try{
  const page=db.prepare("SELECT * FROM pages WHERE path='/'").get();
  if(!page)throw Error('Startseite fehlt im CMS');
  const body=page.body.replaceAll('tel:+491747540451','tel:+493641820462').replaceAll('+49 174 7540451','+49 3641 820462');
  if(body!==page.body){
   const backup=resolve(dirname(path),'content-backups','home-contact-'+Date.now()+'.json');
   mkdirSync(dirname(backup),{recursive:true});
   writeFileSync(backup,JSON.stringify(page,null,2),{flag:'wx',mode:0o600});
   db.prepare('UPDATE pages SET body=?,version=version+1 WHERE id=? AND version=?').run(body,page.id,page.version);
   console.log('Startseitenkontakt aktualisiert; vorheriger Inhalt: '+backup);
  }else console.log('Startseitenkontakt bereits aktuell; keine Änderung.');
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}finally{db.close()}
