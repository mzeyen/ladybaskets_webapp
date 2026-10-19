import {readFileSync} from 'node:fs';

export const archiveArticles=JSON.parse(readFileSync(new URL('./content/articles.json',import.meta.url),'utf8'));
export const importedArticles=JSON.parse(readFileSync(new URL('./content/imported-news.json',import.meta.url),'utf8'));

export function importArticles(db,sanitize){
 db.exec('CREATE TABLE IF NOT EXISTS article_imports(source TEXT PRIMARY KEY,article_id INTEGER,position INTEGER)');
 const seen=db.prepare('SELECT source FROM article_imports WHERE source=?');
 const match=db.prepare('SELECT id FROM articles WHERE title=? AND (body=? OR (date<>\'\' AND date=?)) ORDER BY id LIMIT 1');
 const legacy=db.prepare('SELECT id FROM articles WHERE title=? AND date=? ORDER BY id LIMIT 1');
 const insert=db.prepare("INSERT INTO articles(title,category,body,format,status,date) VALUES(?,?,?,'html','published',?)");
 const mark=db.prepare('INSERT INTO article_imports(source,article_id,position) VALUES(?,?,?)');
 db.exec('BEGIN');
 try{
  for(const [position,article] of importedArticles.entries()){
   if(seen.get(article.source))continue;
   const body=sanitize(article.body);
   const found=article.existingTitle?legacy.get(article.existingTitle,article.date):match.get(article.title,body,article.date);
   const id=found?.id??insert.run(article.title,article.category,body,article.date).lastInsertRowid;
   mark.run(article.source,id,position);
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function initializeArticles(db,sanitize){
 const importedBefore=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='article_imports'").get()&&db.prepare('SELECT source FROM article_imports LIMIT 1').get();
 const empty=!db.prepare('SELECT id FROM articles LIMIT 1').get()&&!importedBefore;
 const insert=db.prepare('INSERT INTO articles(title,category,body,format,status,date) VALUES(?,?,?,?,?,?)');
 const upgrade=db.prepare("UPDATE articles SET body=?,format='html' WHERE title=? AND date=? AND body=? AND format='text'");
 db.exec('BEGIN');
 try{
  for(const article of archiveArticles){
   const body=sanitize(article.body);
   if(empty)insert.run(article.title,article.category,body,'html','published',article.date);
   else upgrade.run(body,article.title,article.date,article.legacyBody);
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}
