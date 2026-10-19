import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {extname} from 'node:path';

const origin='https://www.ladybaskets.de';
const cache='.migration/cache';
mkdirSync(cache,{recursive:true});
mkdirSync('public/seiten',{recursive:true});
mkdirSync('public/assets/original',{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,16);
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi,e=>({ '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ' }[e]??String.fromCodePoint(e[2].toLowerCase()==='x'?parseInt(e.slice(3,-1),16):parseInt(e.slice(2,-1),10))));
const voids=new Set(['img','br','hr','input','meta','link','source','area','wbr','embed','param','col','base']);
function parse(html){
 html=html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi,(whole,script)=>{
  const addy=script.match(/var (addy[\da-f]+)\s*=\s*([^;]+);/i);
  if(addy){
   // Collect quoted fragments from the two address assignments only.
   const assignments=script.split('\n').filter(l=>l.trim().startsWith('var '+addy[1]+' =')||l.trim().startsWith(addy[1]+' =')).join(' ');
   const email=decode([...assignments.matchAll(/'([^']*)'/g)].map(m=>m[1]).join(''));
   if(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+(?:\?.*)?$/.test(email))return `<a href="mailto:${escape(email)}">${escape(email.split('?')[0])}</a>`;
  }
  const widget=script.match(/widget\.(mannschaftswidget|ligawidget|vereinswidget)\([^,]+,\s*(\{[\s\S]*?\})\s*\)/);
  if(widget)try{
   const params=JSON.parse(widget[2]),kind=widget[1],id=params.mannschaftsId||params.ligaNr||params.vereinsId;
   const entity=kind==='mannschaftswidget'?'mannschaft':kind==='ligawidget'?'liga':'verein';
   if(/^\d+$/.test(String(id)))return `<p><a href="https://www.basketball-bund.net/widget/widgets/index2.html#!/${kind}/${entity}/${id}/params/${encodeURIComponent(JSON.stringify(params))}">Spielplan und Ergebnisse beim Basketballverband öffnen ↗</a></p>`;
  }catch{}
  return '';
 });
 html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/Diese E-Mail-Adresse ist vor Spambots geschützt! Zur Anzeige muss JavaScript eingeschaltet sein!/g,'');
 const root={tag:'root',attrs:{},children:[]},stack=[root];
 for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
  if(token.startsWith('</')){const tag=token.match(/^<\/([\w-]+)/)?.[1].toLowerCase();const i=stack.findLastIndex(n=>n.tag===tag);if(i>0)stack.length=i;continue}
  if(token.startsWith('<!')||token.startsWith('<?'))continue;
  if(token.startsWith('<')){
   const m=token.match(/^<([\w-]+)/);if(!m)continue;
   const tag=m[1].toLowerCase(),attrs={};
   for(const a of token.slice(m[0].length).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]);
   const node={tag,attrs,children:[]};stack.at(-1).children.push(node);
   if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(node);
  }else stack.at(-1).children.push(token);
 }
 return root;
}
function find(node,predicate,result=[]){if(typeof node==='string')return result;if(predicate(node))result.push(node);for(const child of node.children)find(child,predicate,result);return result}
const text=n=>typeof n==='string'?decode(n):n.children.map(text).join('');
function regions(tree){return find(tree,n=>['maintop-row','content-row','mainbottom-row'].includes(n.attrs.id))}
function canonical(value,base=origin){
 try{const u=new URL(value,base);if(u.hostname==='ladybaskets.de')u.hostname='www.ladybaskets.de';if(u.origin===origin)u.hash='';u.searchParams.sort();return u.href}catch{return null}
}
async function download(url){
 const file=`${cache}/${hash(url)}`;
 if(existsSync(file))return {data:readFileSync(file),type:readFileSync(file+'.type','utf8')};
 for(let i=0;i<3;i++)try{
  const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`${r.status}: ${url}`);
  const data=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'';
  writeFileSync(file,data);writeFileSync(file+'.type',type);return {data,type};
 }catch(e){if(i===2)throw e}
}
const primary=[
 ['about-us','verein','Der Verein'],['teams','teams','Unsere Teams'],['gallery','galerie','Galerie'],
 ['contact-us','kontakt','Kontakt'],['our-sponsors','partner','Sponsoren & Freunde'],
 ['downloads','downloads','Downloads'],['home/archiv','archiv','Beitragsarchiv'],['privacy-policy','datenschutz','Datenschutz'],
];
const names=new Map(primary.map(([path,slug,title])=>[canonical('/index.php/'+path),{slug,title}]));
names.set(canonical('/index.php'),{slug:'aktuelles',title:'Aktuelles aus dem Verein'});
const queue=[...names.keys()],pages=new Map(),files=new Map(),failures=[];
function isPage(url){const u=new URL(url);return u.origin===origin&&u.pathname.startsWith('/index.php')&&!/\/download\/?$/.test(u.pathname)&&!u.searchParams.has('task')&&!u.searchParams.has('format')&&!u.pathname.includes('/component/')}
for(let i=0;i<queue.length;i++){
 const url=queue[i];if(pages.has(url))continue;
 if(queue.length>600)throw Error('Unexpectedly large crawl; review queue');
 try{
  const {data,type}=await download(url);
  if(!type.includes('html')){files.set(url,{data,type});continue}
  const tree=parse(data.toString('utf8')),content=regions(tree);
  if(!content.length)throw Error('No page content: '+url);
  const title=text(find(tree,n=>n.tag==='title')[0]||{children:[]}).trim();
  const named=names.get(url),slug=named?.slug||'seite-'+hash(url);
  pages.set(url,{url,slug,title:named?.title||title,content});
  for(const node of content.flatMap(n=>find(n,x=>x.tag==='a'&&x.attrs.href))){
   const target=canonical(node.attrs.href,url);
   if(target&&isPage(target)&&!queue.includes(target))queue.push(target);
  }
  if(i%10===0)console.log(`Seiten: ${pages.size}, entdeckt: ${queue.length}`);
 }catch(error){failures.push({url,error:error.message});console.log('Nicht abrufbar:',url,error.message)}
}
const assets=new Map();
async function asset(url){
 if(assets.has(url))return assets.get(url);
 try{
  const {data,type}=files.get(url)||await download(url);
  let ext=extname(new URL(url).pathname).toLowerCase();
  if(!/^\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|zip|svg)$/.test(ext))ext=type.includes('pdf')?'.pdf':type.includes('jpeg')?'.jpg':type.includes('png')?'.png':type.includes('gif')?'.gif':'.bin';
  if(type.includes('html'))throw Error('HTML statt Datei');
  const path=`/assets/original/${hash(url)}${ext}`;
  writeFileSync('public'+path,data);assets.set(url,path);return path;
 }catch(error){failures.push({url,error:error.message});return url}
}
async function link(href,base){
 const url=canonical(href,base);if(!url)return null;
 const u=new URL(url);if(!['http:','https:','mailto:','tel:'].includes(u.protocol))return null;
 if(pages.has(url))return '/seiten/'+pages.get(url).slug+'.html';
 if(u.origin===origin&&(/\/download\/?$/.test(u.pathname)||/\.(pdf|docx?|xlsx?|zip|jpe?g|png|gif|webp)$/i.test(u.pathname)))return asset(url);
 if(u.origin===origin&&['/','/index.php'].includes(u.pathname)&&!u.search)return '/';
 return url;
}
const allowed=new Set('p br hr strong b em i u h1 h2 h3 h4 h5 h6 ul ol li blockquote a img figure figcaption table thead tbody tr td th caption time dl dt dd'.split(' '));
async function render(node,base){
 if(typeof node==='string')return node;
 if(['script','style','noscript','input','textarea','select','form'].includes(node.tag))return '';
 if((node.attrs.class||'').includes('filters'))return '';
 if(node.tag==='iframe'){
  const href=await link(node.attrs.src||'',base);
  return href?`<p><a class="source-link" href="${escape(href)}" target="_blank" rel="noopener">${href.includes('youtu')?'Video ansehen':'Spielplan und Ergebnisse öffnen'} ↗</a></p>`:'';
 }
 const body=(await Promise.all(node.children.map(n=>render(n,base)))).join('');
 if(!allowed.has(node.tag))return body;
 const tag=node.tag==='h1'?'h2':node.tag;
 let attrs='';
 if(tag==='a'){
  const href=await link(node.attrs.href||'',base);if(!href)return body;
  attrs=` href="${escape(href)}"`;
  if(href.startsWith('http'))attrs+=' target="_blank" rel="noopener noreferrer"';
 }
 if(tag==='img'){
  const url=canonical(node.attrs.src||'',base);if(!url||!['http:','https:'].includes(new URL(url).protocol))return '';
  const src=new URL(url).origin===origin?await asset(url):url;
  if(new URL(url).origin===origin&&src===url)return '';
  attrs=` src="${escape(src)}" alt="${escape(node.attrs.alt||'')}" loading="lazy"`;
 }
 for(const key of ['colspan','rowspan'])if(/^\d{1,2}$/.test(node.attrs[key]||''))attrs+=` ${key}="${node.attrs[key]}"`;
 return `<${tag}${attrs}>${voids.has(tag)?'':body+`</${tag}>`}`;
}
const nav=primary.filter(([,,title])=>title!=='Datenschutz').map(([,slug,title])=>`<a href="/seiten/${slug}.html">${escape(title)}</a>`).join('');
const index=[];
for(const page of pages.values()){
 let body=(await Promise.all(page.content.map(n=>render(n,page.url)))).join('');
 // No legacy contact form: use the club's published contact details directly.
 if(page.slug==='kontakt')body=body.replace(/<h3>\s*Contact\s+Form:\s*<\/h3>/i,'')+'<div class="contact-card"><h2>Schreib uns</h2><p><a href="mailto:post@ladybaskets.de">post@ladybaskets.de</a></p><p><a href="tel:+493641820462">+49 3641 820462</a></p></div>';
 const title=escape(page.title);
 const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · LadyBaskets Jena</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/pages.css"></head><body><div class="topline"><span>LADYBASKETS JENA E.V.</span><a href="/seiten/kontakt.html">Komm zum Probetraining ↗</a></div><header><a class="brand" href="/"><img class="club-logo" src="/assets/ladybaskets-original-logo.png" alt="LadyBaskets Jena e.V." width="599" height="370"></a><nav aria-label="Hauptnavigation"><a href="/#news">Aktuelles</a><a href="/seiten/teams.html">Teams</a><a href="/seiten/verein.html">Verein</a><a href="/seiten/kontakt.html">Kontakt</a></nav><a class="outline login" href="/#vereinsbereich">Vereinsbereich ↗</a></header><main class="import-layout"><aside><a class="home-link" href="/">← Startseite</a><nav aria-label="Vereinsseiten">${nav}</nav></aside><article class="import-page"><div class="eyebrow muted">LADYBASKETS JENA · VEREINSLEBEN</div><h1>${title}</h1><div class="import-content">${body}</div></article></main><footer><a class="brand" href="/"><img class="club-logo" src="/assets/ladybaskets-original-logo.png" alt="LadyBaskets Jena e.V."></a><p>Basketball im Herzen. Jena im Rücken.</p><div><a href="/seiten/archiv.html">Archiv</a><a href="/seiten/downloads.html">Downloads</a><a href="/seiten/datenschutz.html">Datenschutz</a></div><small>© ${new Date().getFullYear()} LadyBaskets Jena e.V.</small></footer></body></html>`;
 writeFileSync(`public/seiten/${page.slug}.html`,html);
 index.push({url:page.url,path:`/seiten/${page.slug}.html`,title:page.title});
}
writeFileSync('content/site-migration.json',JSON.stringify({date:new Date().toISOString(),pages:index,assets:[...assets].map(([url,path])=>({url,path})),failures},null,2)+'\n');
console.log(JSON.stringify({pages:pages.size,assets:assets.size,failures},null,2));
