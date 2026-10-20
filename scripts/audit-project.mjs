// Local audit only: uses a fresh temporary database, never the application database.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

const dir=mkdtempSync(join(tmpdir(),'ladybaskets-audit-'));
const base='http://127.0.0.1:3194';
const child=spawn(process.execPath,['server.mjs'],{
 env:{...process.env,NODE_ENV:'audit',HOST:'127.0.0.1',PORT:'3194',DB_PATH:join(dir,'audit.sqlite'),COOKIE_SECURE:'0'},
 stdio:['ignore','pipe','pipe']
});
const evidence={date:'2026-10-20',scope:'Local source and isolated HTTP checks; no production access',checks:[]};
let proxy;
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);evidence.checks.push({name,actual});};
async function api(path,method='GET',data,cookie){
 const response=await fetch(base+'/api/'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Audit server exited before startup');})]);
 // Model a reverse proxy preserving the public Host and forwarding a remote client address.
 proxy=http.createServer((req,res)=>{
  const upstream=http.request(base+req.url,{method:req.method,headers:{...req.headers,host:'audit.example.invalid','x-forwarded-for':'203.0.113.10','x-forwarded-proto':'https'}},response=>{
   res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });
 proxy.listen(3195,'127.0.0.1');await once(proxy,'listening');
 const setup=await fetch('http://127.0.0.1:3195/api/setup',{method:'POST',headers:{Origin:'https://audit.example.invalid','Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.invalid',password:'audit-owner-password-2026'})});
 check('Setup accepted through loopback reverse proxy on empty database',setup.status,201);
 const owner=await api('login','POST',{email:'owner@example.invalid',password:'audit-owner-password-2026'});
 check('Isolated owner login',owner.status,200);
 check('Unauthenticated member read blocked',(await api('members')).status,401);
 const pages=(await api('pages','GET',undefined,owner.cookie)).body;
 const urls=new Set();let renderedPages=0;
 for(const page of pages){
  const response=await fetch(base+page.path);
  assert.equal(response.status,200,page.path);renderedPages++;
  for(const [,value] of (await response.text()).matchAll(/(?:href|src)="(\/(?!\/)[^"]*)"/g))urls.add(new URL(value,base).pathname);
 }
 const broken=[];
 for(const path of urls){const response=await fetch(base+path);await response.arrayBuffer();if(response.status!==200)broken.push({path,status:response.status});}
 check('All initial CMS pages render',renderedPages,222);
 check('Broken local href/src targets in rendered pages',broken,[]);
 evidence.checks.push({name:'Unique rendered local href/src targets checked',actual:urls.size});
 check('No sitemap endpoint',(await fetch(base+'/sitemap.xml')).status,404);
 check('No robots endpoint',(await fetch(base+'/robots.txt')).status,404);
 const teams=(await api('pages/'+pages.find(p=>p.slug==='teams').id,'GET',undefined,owner.cookie)).body;
 check('Set imported teams page to draft',(await api('pages','POST',{...teams,status:'draft'},owner.cookie)).status,200);
 check('Canonical draft route blocked',(await fetch(base+'/seiten/teams.html')).status,404);
 const duplicate=await fetch(base+'/seiten//teams.html');
 check('Duplicate slash serves static original of unpublished page',duplicate.status,200);
 check('Duplicate slash response contains original team content',(await duplicate.text()).includes('U10 - SPIELRUNDE'),true);
 const posted=await fetch(base+'/seiten/teams.html',{method:'POST'});
 check('POST serves static original without authentication',posted.status,200);
 check('POST response contains original team content',(await posted.text()).includes('U10 - SPIELRUNDE'),true);
 check('Editor creation',(await api('users','POST',{email:'editor@example.invalid',password:'audit-editor-password-2026'},owner.cookie)).status,201);
 check('No user deletion endpoint',(await api('users/2','DELETE',undefined,owner.cookie)).status,404);
 const first=(await api('articles','GET',undefined,owner.cookie)).body[0];
 const edit={...first,title:'Audit initial edit'};
 check('First article update',(await api('articles','POST',edit,owner.cookie)).status,200);
 check('Stale article update also accepted',(await api('articles','POST',{...first,title:'Audit stale overwrite'},owner.cookie)).status,200);
 check('Stale update overwrites newer title',(await api('articles','GET',undefined,owner.cookie)).body.find(a=>a.id===first.id).title,'Audit stale overwrite');
 for(let i=0;i<10;i++)check('Invalid login '+(i+1),(await api('login','POST',{email:'missing@example.invalid',password:'invalid'})).status,401);
 check('Valid unrelated account blocked after ten failures on shared IP',(await api('login','POST',{email:'owner@example.invalid',password:'audit-owner-password-2026'})).status,429);
 mkdirSync('audit',{recursive:true});
 writeFileSync('audit/evidence-2026-10-20.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
}finally{
 if(proxy)await new Promise(resolve=>proxy.close(resolve));
 const stopped=once(child,'exit');child.kill();await stopped;
 // Only remove the verified temporary directory created above.
 if(!dir.startsWith(join(tmpdir(),'ladybaskets-audit-')))throw Error('Unexpected cleanup path');
 rmSync(dir,{recursive:true,force:true});
}
