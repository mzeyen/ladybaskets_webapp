import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export const newsPlaceholder='{{AKTUELLE_BEITRAEGE}}';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const primary=['verein','teams','galerie','kontakt','partner','downloads','archiv'];

export function safePage(html,sanitize){
 // Preserve layout containers from the existing homepage, but no executable attributes.
 const preserved=[];
 const source=String(html).replace(/<\/?(?:div|section|span|small|h1|h6|time|button|a|p|img|h2|h3|h4|h5|figure|figcaption|ul|ol|li|table|thead|tbody|tr|td|th)\b[^>]*>/gi,tag=>{
  const match=tag.match(/^<(\/?)([a-z0-9]+)\b/i),name=match[2].toLowerCase();
  const container=['div','section','span','small','h1','h6','time','button'].includes(name);
  let safe=container?`<${match[1]}${name}`:sanitize(tag).replace(/>$/,'');
  if(!safe)return '';
  if(!match[1]){
   const attrs=key=>tag.match(new RegExp('\\s'+key+'="([^"]*)"','i'))?.[1];
   const cls=attrs('class'),id=attrs('id');
   if(cls&&/^[a-zA-Z0-9 _-]{1,200}$/.test(cls))safe+=` class="${cls}"`;
   if(id&&['news','verein','teams','kontakt','news-grid','all-news'].includes(id))safe+=` id="${id}"`;
   if(name==='button')safe+=' type="button"';
   if(name==='button'&&['Alle','Spielbericht','Vereinsleben'].includes(attrs('data-filter')))safe+=` data-filter="${esc(attrs('data-filter'))}"`;
   if(attrs('role')==='img')safe+=' role="img"';
   if(attrs('aria-label'))safe+=` aria-label="${esc(attrs('aria-label'))}"`;
  }
  safe+='>';
  preserved.push(safe);return `PAGESAFEPLACEHOLDER${preserved.length-1}END`;
 });
 return sanitize(source).replace(/PAGESAFEPLACEHOLDER(\d+)END/g,(_,index)=>preserved[Number(index)]||'');
}

export function initializePages(db,publicDir,sanitize){
 db.exec(`CREATE TABLE IF NOT EXISTS pages(
  id INTEGER PRIMARY KEY,slug TEXT UNIQUE NOT NULL,path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,body TEXT NOT NULL,format TEXT NOT NULL DEFAULT 'html',
  status TEXT NOT NULL DEFAULT 'draft',kind TEXT NOT NULL DEFAULT 'page',
  menu_visible INTEGER NOT NULL DEFAULT 0,menu_order INTEGER NOT NULL DEFAULT 1000,
  version INTEGER NOT NULL DEFAULT 1
 )`);
 const homeTemplate=readFileSync(resolve(publicDir,'index.html'),'utf8');
 const homeBody=homeTemplate.match(/<main id="home">([\s\S]*?)<\/main>/)?.[1];
 const news=homeBody?.match(/<section\b[^>]*id="news"[^>]*>[\s\S]*?<\/section>/)?.[0];
 if(!homeBody||!news)throw Error('Startseitenvorlage unvollständig');
 const report=JSON.parse(readFileSync(new URL('./content/site-migration.json',import.meta.url),'utf8'));
 const exists=db.prepare('SELECT id FROM pages WHERE path=?');
 const insert=db.prepare("INSERT INTO pages(slug,path,title,body,status,kind,menu_visible,menu_order) VALUES(?,?,?,?,'published',?,?,?)");
 db.exec('BEGIN');
 try{
  if(!exists.get('/'))insert.run('startseite','/','Startseite',safePage(homeBody.replace(news,newsPlaceholder),sanitize),'home',0,0);
  for(const page of [...report.pages,{path:'/seiten/impressum.html',title:'Impressum'}]){
   if(exists.get(page.path))continue;
   const body=readFileSync(resolve(publicDir,'.'+page.path),'utf8').split('<div class="import-content">')[1]?.split('</div></article></main>')[0];
   if(body===undefined)throw Error('Seiteninhalt fehlt: '+page.path);
   const slug=page.path.split('/').at(-1).replace(/\.html$/,'');
   const order=primary.indexOf(slug);
   insert.run(slug,page.path,page.title,safePage(body,sanitize),'page',order>=0?1:0,order>=0?order:1000);
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
 return {homeTemplate,news};
}

export function pageNavigation(db){return db.prepare("SELECT id,title,path,slug FROM pages WHERE status='published' AND menu_visible=1 AND kind<>'home' ORDER BY menu_order,id").all()}
const links=nav=>nav.map(p=>`<a href="${esc(p.path)}">${esc(p.title)}</a>`).join('');
function mainNavigation(nav){
 return '<a href="/#news">Aktuelles</a>'+links(['teams','verein','kontakt'].map(slug=>nav.find(p=>p.slug===slug)).filter(Boolean));
}
export function renderPage(page,nav,{homeTemplate,news},preview=false){
 let body=page.format==='html'?page.body:`<div class="article-body">${esc(page.body)}</div>`;
 if(page.kind==='home'){
  body=body.replaceAll(newsPlaceholder,news);
  return homeTemplate.replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${esc(page.title)} · LadyBaskets Jena</title>`)
   .replace(/<main id="home">[\s\S]*?<\/main>/,()=>`<main id="home">${body}</main>`)
   .replace(/<nav aria-label="Hauptnavigation">[\s\S]*?<\/nav>/,()=>`<nav aria-label="Hauptnavigation">${mainNavigation(nav)}</nav>`)
   .replace(/<nav class="more-pages"[^>]*>[\s\S]*?<\/nav>/,()=>`<nav class="more-pages" aria-label="Weitere Vereinsseiten">${links(nav.filter(p=>!['teams','verein','kontakt'].includes(p.slug)))}</nav>`);
 }
 const title=esc(page.title);
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · LadyBaskets Jena</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pages.css"></head><body><div class="topline"><span>LADYBASKETS JENA E.V.</span><a href="/seiten/kontakt.html">Komm zum Probetraining ↗</a></div><header><a class="brand" href="/"><img class="club-logo" src="/assets/ladybaskets-original-logo.png" alt="LadyBaskets Jena e.V." width="599" height="370"></a><nav aria-label="Hauptnavigation">${mainNavigation(nav)}</nav><a class="outline login" href="/#vereinsbereich">Vereinsbereich ↗</a></header><main class="import-layout"><aside><a class="home-link" href="/">← Startseite</a><nav aria-label="Vereinsseiten">${links(nav)}</nav></aside><article class="import-page">${preview?'<p class="preview-banner">Vorschau – diese Seite ist nicht veröffentlicht.</p>':''}<div class="eyebrow muted">LADYBASKETS JENA · VEREINSLEBEN</div><h1>${title}</h1><div class="import-content">${body}</div></article></main><footer><a class="brand" href="/"><img class="club-logo" src="/assets/ladybaskets-original-logo.png" alt="LadyBaskets Jena e.V."></a><p>Basketball im Herzen. Jena im Rücken.</p><div>${links(nav.filter(p=>['archiv','downloads'].includes(p.slug)))}<a href="/seiten/impressum.html">Impressum</a><a href="/seiten/datenschutz.html">Datenschutz</a></div><small>© ${new Date().getFullYear()} LadyBaskets Jena e.V.</small></footer></body></html>`;
}
