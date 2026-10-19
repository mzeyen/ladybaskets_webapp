import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

mkdirSync('data',{recursive:true});
const db=new DatabaseSync(process.env.DB_PATH||'data/club.sqlite');
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,password TEXT,role TEXT); CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY,title TEXT,category TEXT,body TEXT,format TEXT,status TEXT,date TEXT); CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY,name TEXT,email TEXT,team TEXT,status TEXT); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires INTEGER);`);
const hash=p=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')};
const verify=(p,h)=>{const [salt,key]=h.split(':');return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(key,'hex'))};
if(!db.prepare('SELECT id FROM articles LIMIT 1').get()) {
 const add=db.prepare('INSERT INTO articles(title,category,body,format,status,date) VALUES(?,?,?,?,?,?)');
 add.run('Klar und deutlich','Spielbericht','Mit starker Verteidigung und viel Teamgeist haben die LadyBaskets am 23. März 2025 ihr Spiel in Jena gewonnen. Ein Rückblick auf einen erfolgreichen Basketballsonntag. Den vollständigen Originalbericht findest du im Archiv auf ladybaskets.de.','text','published','2025-03-23');
 add.run('Die Punkte bleiben bei uns!','Spielbericht','Am 8. März 2025 gewannen die LadyBaskets ihr Heimspiel gegen die SG USV / Science City Jena mit 70:26. Eine intensive Verteidigung legte den Grundstein für diesen gemeinsamen Erfolg.','text','published','2025-03-09');
 add.run('Ein Sommer voller Basketball','Vereinsleben','Beim Sommercamp vom 22. bis 26. Juli 2024 standen Basketball, Bewegung und gemeinsame Erlebnisse auf dem Programm. Ein Rückblick auf eine besondere Woche für den Nachwuchs.','text','published','2024-08-11');
}
const attempts=new Map();
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>200000)throw Error('Die Eingabe ist zu groß.')}return JSON.parse(text||'{}')}
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
export function safeRich(html){return String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|svg|math)[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,tag=>{const m=tag.match(/^<(\/?)(p|br|strong|b|em|i|u|h2|h3|ul|ol|li|blockquote)\b[^>]*>$/i);return m?`<${m[1]}${m[2].toLowerCase()}>`:''})}
const publicDir=resolve('public');
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https://images.unsplash.com; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];
 const user=token?db.prepare('SELECT users.id,email,role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token,Date.now()):null;
 if(url.pathname.startsWith('/api/')){
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:'Ungültiger Anfrageursprung.'});
 const p=url.pathname;
 if(p==='/api/session')return json(res,200,{user,setup:!db.prepare('SELECT id FROM users LIMIT 1').get()});
 if(p==='/api/setup'&&req.method==='POST'){
 if(db.prepare('SELECT id FROM users LIMIT 1').get())return json(res,409,{error:'Die Einrichtung ist bereits abgeschlossen.'});
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return json(res,403,{error:'Ersteinrichtung nur lokal möglich.'});
 const b=await body(req);if(!/^\S+@\S+\.\S+$/.test(b.email)||typeof b.password!=='string'||b.password.length<12)return json(res,400,{error:'Bitte eine gültige E-Mail und mindestens 12 Zeichen als Passwort verwenden.'});
 if(db.prepare('SELECT id FROM users LIMIT 1').get())return json(res,409,{error:'Die Einrichtung ist bereits abgeschlossen.'});
 db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(b.email.toLowerCase(),hash(b.password),'admin');return json(res,201,{ok:true});}
 if(p==='/api/login'&&req.method==='POST'){
 const ip=req.socket.remoteAddress;const a=attempts.get(ip)||{n:0,time:Date.now()};if(Date.now()-a.time>900000){a.n=0;a.time=Date.now()}if(a.n>=10)return json(res,429,{error:'Zu viele Versuche. Bitte in 15 Minuten erneut anmelden.'});a.n++;attempts.set(ip,a);
 const b=await body(req),u=db.prepare('SELECT * FROM users WHERE email=?').get(clean(b.email).toLowerCase());if(!u||typeof b.password!=='string'||!verify(b.password,u.password))return json(res,401,{error:'E-Mail oder Passwort stimmt nicht.'});
 attempts.delete(ip);const t=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(t,u.id,Date.now()+28800000);res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);return json(res,200,{ok:true});}
 if(p==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(token||'');res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
 if(p==='/api/articles'&&req.method==='GET')return json(res,200,db.prepare(user?'SELECT * FROM articles ORDER BY date DESC,id DESC':"SELECT * FROM articles WHERE status='published' ORDER BY date DESC,id DESC").all());
 if(!user)return json(res,401,{error:'Bitte zuerst anmelden.'});
 if(p==='/api/articles'&&req.method==='POST'){
 const b=await body(req);if(!clean(b.title)||!clean(b.body,100000))return json(res,400,{error:'Titel und Inhalt sind erforderlich.'});
 const vals=[clean(b.title,180),clean(b.category,50)||'Vereinsleben',b.format==='html'?safeRich(clean(b.body,100000)):clean(b.body,100000),b.format==='html'?'html':'text',b.status==='published'?'published':'draft'];
 if(b.id){const result=db.prepare('UPDATE articles SET title=?,category=?,body=?,format=?,status=? WHERE id=?').run(...vals,Number(b.id));if(!result.changes)return json(res,404,{error:'Artikel nicht gefunden.'})}else db.prepare('INSERT INTO articles(title,category,body,format,status,date) VALUES(?,?,?,?,?,?)').run(...vals,new Date().toISOString().slice(0,10));return json(res,200,{ok:true});}
 if(p.startsWith('/api/articles/')&&req.method==='DELETE'){db.prepare('DELETE FROM articles WHERE id=?').run(Number(p.split('/').pop()));return json(res,200,{ok:true})}
 if(user.role!=='admin')return json(res,403,{error:'Dieser Bereich ist der Administration vorbehalten.'});
 if(p==='/api/users'&&req.method==='GET')return json(res,200,db.prepare('SELECT id,email,role FROM users').all());
 if(p==='/api/users'&&req.method==='POST'){const b=await body(req);if(!/^\S+@\S+\.\S+$/.test(b.email)||typeof b.password!=='string'||b.password.length<12)return json(res,400,{error:'Gültige E-Mail und Passwort mit mindestens 12 Zeichen erforderlich.'});try{db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(b.email.toLowerCase(),hash(b.password),'editor')}catch{return json(res,409,{error:'Diese E-Mail ist bereits vergeben.'})}return json(res,201,{ok:true})}
 if(p==='/api/members'&&req.method==='GET')return json(res,200,db.prepare('SELECT * FROM members ORDER BY name').all());
 if(p==='/api/members'&&req.method==='POST'){const b=await body(req);if(!clean(b.name,120)||!/^\S+@\S+\.\S+$/.test(b.email))return json(res,400,{error:'Name und gültige E-Mail sind erforderlich.'});const v=[clean(b.name,120),clean(b.email,200),clean(b.team,50),b.status==='passive'?'passive':'active'];if(b.id)db.prepare('UPDATE members SET name=?,email=?,team=?,status=? WHERE id=?').run(...v,Number(b.id));else db.prepare('INSERT INTO members(name,email,team,status) VALUES(?,?,?,?)').run(...v);return json(res,200,{ok:true})}
 if(p.startsWith('/api/members/')&&req.method==='DELETE'){db.prepare('DELETE FROM members WHERE id=?').run(Number(p.split('/').pop()));return json(res,200,{ok:true})}
 return json(res,404,{error:'Nicht gefunden.'});
 }
 const path=resolve(publicDir,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(publicDir+'\\')&&!path.startsWith(publicDir+'/'))return json(res,404,{error:'Nicht gefunden.'});
 try{const data=readFileSync(path);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'})[extname(path)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end('Nicht gefunden')}
 }catch(e){json(res,400,{error:'Die Anfrage konnte nicht verarbeitet werden.'})}});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('LadyBaskets: http://localhost:'+(process.env.PORT||3000)));
