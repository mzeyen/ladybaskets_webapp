import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {repairHomeActions} from '../pages.mjs';

const dbPath=resolve(process.env.DB_PATH||'data/club.sqlite');
const db=new DatabaseSync(dbPath);
const assignments=JSON.parse(readFileSync('content/home-original-images.json','utf8'));
try{
 db.exec('BEGIN IMMEDIATE');
 try{
  const previous={pages:[],articles:[]};
  const home=db.prepare("SELECT * FROM pages WHERE path='/'").get();
  if(!home)throw Error('Startseite fehlt');
  const next=repairHomeActions(home.body);
  if(next!==home.body)previous.pages.push(home);
  const changes=[];
  for(const entry of assignments){
   if(!existsSync(resolve('public','.'+entry.image)))throw Error('Originalbild fehlt: '+entry.image);
   const row=db.prepare('SELECT articles.* FROM articles JOIN article_imports ON article_imports.article_id=articles.id WHERE article_imports.source=?').get(entry.source);
   if(!row)throw Error('Importierter Beitrag fehlt: '+entry.source);
   // Keep any editorially assigned image; add only the missing original.
   if(/<img\b/i.test(row.body))continue;
   if(row.format!=='html')throw Error('Beitrag ist kein HTML: '+row.title);
   const figure=`<figure><img src="${entry.image}" alt="${entry.alt}" loading="lazy"></figure>`;
   const body=figure+row.body.replace(/^\s*<figure\b[^>]*>\s*<\/figure>/i,'');
   previous.articles.push(row);changes.push({id:row.id,body});
  }
  if(previous.pages.length||changes.length){
   const backup=resolve(dirname(dbPath),'content-backups','home-originals-'+Date.now()+'.json');
   mkdirSync(dirname(backup),{recursive:true});
   writeFileSync(backup,JSON.stringify(previous,null,2),{flag:'wx',mode:0o600});
   if(previous.pages.length)db.prepare('UPDATE pages SET body=?,version=version+1 WHERE id=?').run(next,home.id);
   for(const change of changes)db.prepare('UPDATE articles SET body=? WHERE id=?').run(change.body,change.id);
   console.log('Startseitenlinks und '+changes.length+' Beitragsbilder aktualisiert; Sicherung: '+backup);
  }else console.log('Links und Originalbilder bereits aktuell.');
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}finally{db.close()}
