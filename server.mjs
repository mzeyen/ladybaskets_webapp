import http from 'node:http';
import { initializeArticles, importArticles } from './articles.mjs';
import { initializeRoles } from './auth.mjs';
import { initializePages, pageNavigation, renderPage, safePage, newsPlaceholder } from './pages.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {hash, verify, validPassword, audit, loginLimiter} from './security.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

mkdirSync('data',{recursive:true});
const db=new DatabaseSync(process.env.DB_PATH||'data/club.sqlite');
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password TEXT,role TEXT); CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY,title TEXT,category TEXT,body TEXT,format TEXT,status TEXT,date TEXT); CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY,name TEXT,email TEXT,team TEXT,status TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);`);
initializeRoles(db);
if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='disabled'))db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
if(process.env.NODE_ENV==='production'&&(process.env.COOKIE_SECURE!=='1'||!process.env.PUBLIC_ORIGIN?.startsWith('https://')))throw Error('Production requires HTTPS PUBLIC_ORIGIN and COOKIE_SECURE=1');
const secureCookie=process.env.NODE_ENV==='production'||process.env.COOKIE_SECURE==='1';
const setupEnabled=process.env.ALLOW_SETUP==='1'&&process.env.NODE_ENV!=='production';
const limiter=loginLimiter();
setInterval(()=>db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now()),3600000).unref();
initializeArticles(db,safeRich);
importArticles(db,safeRich);
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>200000)throw Error('Die Eingabe ist zu groß.')}return JSON.parse(text||'{}')}
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
export function safeRich(html){return String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|svg|math)[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,tag=>{
 const m=tag.match(/^<(\/?)(p|br|strong|b|em|i|u|h2|h3|h4|h5|ul|ol|li|blockquote|a|img|figure|figcaption|table|thead|tbody|tr|td|th)\b[^>]*>$/i);if(!m)return '';
 const name=m[2].toLowerCase();if(m[1])return name==='img'?'':`</${name}>`;
 const attribute=key=>tag.match(new RegExp('\\s'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'))?.slice(1).find(v=>v!==undefined)||'';
 const escape=v=>v.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 if(name==='a'){
  const href=attribute('href').replaceAll('&amp;','&');
  return /^(?:#[a-z][\w:-]*$|\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(href)&&!/[\u0000-\u0020\\]/.test(href)?`<a href="${escape(href)}" rel="noopener noreferrer">`:'<a>';
 }
 if(name==='img'){
  const src=attribute('src');
  return /^\/assets\/original\/[a-f\d]+\.(?:png|jpe?g|gif|webp)$/i.test(src)?`<img src="${src}" alt="${escape(attribute('alt'))}" loading="lazy">`:'';
 }
 return `<${name}>`;
 })}
const publicDir=resolve('public');
const pageTemplates=initializePages(db,publicDir,safeRich);
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 res.on('finish',()=>{if(!['GET','HEAD'].includes(req.method))audit('request',{method:req.method,path:url.pathname,status:res.statusCode,actor:res.localsUser||null})});
 if(url.pathname.includes('//')||url.pathname.includes('\\')||/%(?:2f|5c|2e)/i.test(url.pathname))return json(res,404,{error:'Nicht gefunden.'});
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];
 const user=token?(db.prepare('SELECT users.id,email,role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>? AND users.disabled=0').get(token,Date.now())??null):null;
 res.localsUser=user?.id;
 if(url.pathname.startsWith('/api/')){
 if(!['GET','HEAD'].includes(req.method)&&(process.env.PUBLIC_ORIGIN?req.headers.origin!==process.env.PUBLIC_ORIGIN:req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`))return json(res,403,{error:'Ungültiger Anfrageursprung.'});
 const p=url.pathname;
 if(p==='/api/session')return json(res,200,{user,setup:setupEnabled&&!db.prepare('SELECT id FROM users LIMIT 1').get()});
 if(p==='/api/setup'&&req.method==='POST'){
 if(!setupEnabled)return json(res,403,{error:'Die HTTP-Ersteinrichtung ist deaktiviert.'});
 if(db.prepare('SELECT id FROM users LIMIT 1').get())return json(res,409,{error:'Die Einrichtung ist bereits abgeschlossen.'});
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return json(res,403,{error:'Ersteinrichtung nur lokal möglich.'});
 const b=await body(req);if(!/^\S+@\S+\.\S+$/.test(b.email)||!validPassword(b.password))return json(res,400,{error:'Bitte eine gültige E-Mail und mindestens 12 Zeichen als Passwort verwenden.'});
 if(db.prepare('SELECT id FROM users LIMIT 1').get())return json(res,409,{error:'Die Einrichtung ist bereits abgeschlossen.'});
 db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(b.email.trim().toLowerCase(),await hash(b.password),'superadmin');return json(res,201,{ok:true});}
 if(p==='/api/login'&&req.method==='POST'){
 const b=await body(req),email=clean(b.email).toLowerCase();
 const ip=process.env.TRUST_PROXY==='loopback'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)?String(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
 const leave=limiter.enter(email,ip);if(!leave)return json(res,429,{error:'Zu viele Versuche. Bitte später erneut anmelden.'});
 try{
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 const ok=typeof b.password==='string'&&b.password.length<=256&&await verify(b.password,u?.password||'invalid:'+ '00'.repeat(64));
 if(!ok||!u||u.disabled||!db.prepare('SELECT id FROM users WHERE id=? AND password=? AND disabled=0').get(u.id,u.password)){audit('login_failed');return json(res,401,{error:'E-Mail oder Passwort stimmt nicht.'})}
 const t=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(t,u.id,Date.now()+28800000);audit('login_success',{actor:u.id});res.setHeader('Set-Cookie','session='+t+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(secureCookie?'; Secure':''));return json(res,200,{ok:true});
 }finally{leave()}}
 if(p==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(token||'');res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(secureCookie?'; Secure':''));return json(res,200,{ok:true})}
 if(p==='/api/articles'&&req.method==='GET')return json(res,200,db.prepare(`SELECT articles.* FROM articles LEFT JOIN article_imports ON article_imports.article_id=articles.id ${user?'':"WHERE status='published'"} ORDER BY CASE WHEN article_imports.source IS NULL THEN 0 ELSE 1 END,CASE WHEN article_imports.source IS NULL THEN date END DESC,article_imports.position ASC,articles.id DESC`).all());
 if(p==='/api/navigation'&&req.method==='GET')return json(res,200,pageNavigation(db));
 if(!user)return json(res,401,{error:'Bitte zuerst anmelden.'});
 if(p==='/api/account/password'&&req.method==='POST'){
 const b=await body(req),current=db.prepare('SELECT password FROM users WHERE id=?').get(user.id);
 if(!validPassword(b.password)||typeof b.currentPassword!=='string'||b.currentPassword.length>256||!await verify(b.currentPassword,current.password))return json(res,400,{error:'Aktuelles Passwort prüfen; neues Passwort benötigt 12 bis 256 Zeichen.'});
 const next=await hash(b.password);
 const result=db.prepare('UPDATE users SET password=? WHERE id=? AND password=? AND disabled=0').run(next,user.id,current.password);
 if(!result.changes)return json(res,409,{error:'Konto wurde inzwischen geändert.'});
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit('password_changed',{actor:user.id});return json(res,200,{ok:true});
 }
 if(p==='/api/account/sessions'&&req.method==='DELETE'){db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit('sessions_revoked',{actor:user.id});return json(res,200,{ok:true})}
 if(/^\/api\/users\/\d+$/.test(p)&&req.method==='PATCH'){
 if(user.role!=='superadmin')return json(res,403,{error:'Nur der Superadmin darf Konten verwalten.'});
 const id=Number(p.split('/').pop()),target=db.prepare('SELECT id,role FROM users WHERE id=?').get(id),b=await body(req);
 if(!target)return json(res,404,{error:'Konto nicht gefunden.'});
 if(target.role==='superadmin')return json(res,403,{error:'Das Superadmin-Konto wird über die eigenen Kontoeinstellungen verwaltet.'});
 if(typeof b.disabled!=='boolean'&&b.password===undefined&&b.revoke!==true)return json(res,400,{error:'Keine gültige Aktion.'});
 if(b.password!==undefined&&!validPassword(b.password))return json(res,400,{error:'Passwort benötigt 12 bis 256 Zeichen.'});
 const next=b.password===undefined?null:await hash(b.password);
 db.exec('BEGIN');try{
 if(typeof b.disabled==='boolean')db.prepare('UPDATE users SET disabled=? WHERE id=?').run(b.disabled?1:0,id);
 if(next)db.prepare('UPDATE users SET password=? WHERE id=?').run(next,id);
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 audit('account_updated',{actor:user.id,target:id,disabled:b.disabled,passwordReset:!!next});return json(res,200,{ok:true});
 }
 if(p==='/api/pages'||p.startsWith('/api/pages/')){
  if(!['superadmin','admin','editor'].includes(user.role))return json(res,403,{error:'Kein Zugriff auf die Seitenverwaltung.'});
  if(p==='/api/pages'&&req.method==='GET')return json(res,200,db.prepare('SELECT id,slug,path,title,format,status,kind,menu_visible,menu_order,version FROM pages ORDER BY kind,menu_order,title').all());
  if(/^\/api\/pages\/\d+$/.test(p)&&req.method==='GET'){
   const page=db.prepare('SELECT * FROM pages WHERE id=?').get(Number(p.split('/').pop()));
   return page?json(res,200,page):json(res,404,{error:'Seite nicht gefunden.'});
  }
  if(p==='/api/pages'&&req.method==='POST'){
   const b=await body(req),title=clean(b.title,180);
   if(!title||typeof b.body!=='string'||!b.body.trim())return json(res,400,{error:'Titel und Inhalt sind erforderlich.'});
   if(b.body.length>150000)return json(res,400,{error:'Der Seiteninhalt ist zu lang (maximal 150.000 Zeichen).'});
   if(!['draft','published'].includes(b.status))return json(res,400,{error:'Bitte einen gültigen Veröffentlichungsstatus wählen.'});
   const current=b.id?db.prepare('SELECT * FROM pages WHERE id=?').get(Number(b.id)):null;
   if(b.id&&!current)return json(res,404,{error:'Seite nicht gefunden.'});
   if(current&&b.slug!==current.slug)return json(res,400,{error:'Die Adresse bestehender Seiten bleibt erhalten, damit Links weiterhin funktionieren.'});
   const slug=current?.slug||clean(b.slug,80);
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return json(res,400,{error:'Die Seitenadresse darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.'});
   if(!current&&db.prepare('SELECT id FROM pages WHERE slug=?').get(slug))return json(res,409,{error:'Diese Seitenadresse ist bereits vergeben.'});
   if(current?.kind==='home'&&b.status!=='published')return json(res,400,{error:'Die Startseite muss veröffentlicht bleiben.'});
   const format=current?.kind==='home'?'html':b.format==='text'?'text':'html';
   let content=format==='html'?safePage(b.body,safeRich):b.body.trim();
   if(current?.kind==='home'){
    const parts=content.split(newsPlaceholder);content=parts.length>1?parts.shift()+newsPlaceholder+parts.join(''):content+newsPlaceholder;
   }
   const menuVisible=current?.kind==='home'?0:b.menu_visible?1:0;
   if(current){
    const result=db.prepare('UPDATE pages SET title=?,body=?,format=?,status=?,menu_visible=?,version=version+1 WHERE id=? AND version=?').run(title,content,format,b.status,menuVisible,current.id,Number(b.version));
    if(!result.changes)return json(res,409,{error:'Die Seite wurde inzwischen geändert. Bitte erneut öffnen, damit keine Änderungen überschrieben werden.'});
    return json(res,200,{id:current.id,path:current.path,version:current.version+1});
   }
   const path='/seiten/'+slug+'.html';
   const result=db.prepare("INSERT INTO pages(slug,path,title,body,format,status,menu_visible) VALUES(?,?,?,?,?,?,?)").run(slug,path,title,content,format,b.status,menuVisible);
   return json(res,201,{id:Number(result.lastInsertRowid),path,version:1});
  }
  return json(res,405,{error:'Diese Aktion wird nicht unterstützt.'});
 }
 if(p==='/api/articles'&&req.method==='POST'){
 const b=await body(req);if(!clean(b.title)||!clean(b.body,100000))return json(res,400,{error:'Titel und Inhalt sind erforderlich.'});
 const vals=[clean(b.title,180),clean(b.category,50)||'Vereinsleben',b.format==='html'?safeRich(clean(b.body,100000)):clean(b.body,100000),b.format==='html'?'html':'text',b.status==='published'?'published':'draft'];
 if(b.id){const result=db.prepare('UPDATE articles SET title=?,category=?,body=?,format=?,status=? WHERE id=?').run(...vals,Number(b.id));if(!result.changes)return json(res,404,{error:'Artikel nicht gefunden.'})}else db.prepare('INSERT INTO articles(title,category,body,format,status,date) VALUES(?,?,?,?,?,?)').run(...vals,new Date().toISOString().slice(0,10));return json(res,200,{ok:true});}
 if(p.startsWith('/api/articles/')&&req.method==='DELETE'){db.prepare('DELETE FROM articles WHERE id=?').run(Number(p.split('/').pop()));return json(res,200,{ok:true})}
 if(p==='/api/users'&&user.role!=='superadmin')return json(res,403,{error:'Nur der Superadmin darf Redaktionszugänge verwalten.'});
 if(!['superadmin','admin'].includes(user.role))return json(res,403,{error:'Dieser Bereich ist der Administration vorbehalten.'});
 if(p==='/api/users'&&req.method==='GET')return json(res,200,db.prepare('SELECT id,email,role,disabled FROM users').all());
 if(p==='/api/users'&&req.method==='POST'){const b=await body(req);if(!/^\S+@\S+\.\S+$/.test(b.email)||!validPassword(b.password))return json(res,400,{error:'Gültige E-Mail und Passwort mit mindestens 12 Zeichen erforderlich.'});try{db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(b.email.toLowerCase(),await hash(b.password),'editor')}catch{return json(res,409,{error:'Diese E-Mail ist bereits vergeben.'})}return json(res,201,{ok:true})}
 if(p==='/api/members'&&req.method==='GET')return json(res,200,db.prepare('SELECT * FROM members ORDER BY name').all());
 if(p==='/api/members'&&req.method==='POST'){const b=await body(req);if(!clean(b.name,120)||!/^\S+@\S+\.\S+$/.test(b.email))return json(res,400,{error:'Name und gültige E-Mail sind erforderlich.'});const v=[clean(b.name,120),clean(b.email,200),clean(b.team,50),b.status==='passive'?'passive':'active'];if(b.id)db.prepare('UPDATE members SET name=?,email=?,team=?,status=? WHERE id=?').run(...v,Number(b.id));else db.prepare('INSERT INTO members(name,email,team,status) VALUES(?,?,?,?)').run(...v);return json(res,200,{ok:true})}
 if(p.startsWith('/api/members/')&&req.method==='DELETE'){db.prepare('DELETE FROM members WHERE id=?').run(Number(p.split('/').pop()));return json(res,200,{ok:true})}
 return json(res,404,{error:'Nicht gefunden.'});
 }
 if(['GET','HEAD'].includes(req.method)&&(url.pathname==='/'||url.pathname==='/index.html'||/^\/seiten\/[^/]+\.html$/.test(url.pathname))){
  const path=url.pathname==='/index.html'?'/':url.pathname;
  const page=db.prepare('SELECT * FROM pages WHERE path=?').get(path);
  const preview=!!user&&url.searchParams.get('preview')==='1';
  if(!page||(page.status!=='published'&&!preview)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Seite nicht gefunden.');return}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(page.status==='draft'?{'X-Robots-Tag':'noindex, nofollow'}:{})});
  res.end(req.method==='HEAD'?undefined:renderPage(page,pageNavigation(db),pageTemplates,page.status==='draft'));return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return json(res,405,{error:'Methode nicht erlaubt.'})}
 if(!(/^\/assets\/[a-zA-Z0-9_./-]+$/.test(url.pathname)||['/style.css','/pages.css','/app.js','/page-admin.js','/account-admin.js','/favicon.ico','/robots.txt','/sitemap.xml'].includes(url.pathname)))return json(res,404,{error:'Nicht gefunden.'});
 const path=resolve(publicDir,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(publicDir+'\\')&&!path.startsWith(publicDir+'/'))return json(res,404,{error:'Nicht gefunden.'});
 try{const data=readFileSync(path);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'})[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data)}catch{res.writeHead(404);res.end('Nicht gefunden')}
 }catch(e){audit('request_error',{method:req.method,errorType:e.name});json(res,400,{error:'Die Anfrage konnte nicht verarbeitet werden.'})}});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('LadyBaskets: http://localhost:'+(process.env.PORT||3000)));
