import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Seiten bearbeiten, anlegen, veröffentlichen und dauerhaft speichern',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ladybaskets-pages-')),base='http://127.0.0.1:3096';
 let child;
 async function start(){
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,ALLOW_SETUP:'1',PORT:'3096',DB_PATH:join(dir,'club.sqlite')},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Testserver vorzeitig beendet')))});
 }
 async function stop(){child.kill();await new Promise(resolve=>child.once('exit',resolve));child=null}
 const api=async(path,method='GET',data,cookie,origin=base)=>{
  const response=await fetch(base+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const getPage=async(path,cookie)=>fetch(base+path,{headers:cookie?{Cookie:cookie}:{}});
 try{
  await start();
  assert.equal((await api('pages')).status,401);
  await api('setup','POST',{email:'owner@example.org',password:'test-password-12345'});
  const owner=await api('login','POST',{email:'owner@example.org',password:'test-password-12345'});
  await api('users','POST',{email:'editor@example.org',password:'editor-password-12345'},owner.cookie);
  const editor=await api('login','POST',{email:'editor@example.org',password:'editor-password-12345'});
  const list=(await api('pages','GET',null,editor.cookie)).body;
  assert.equal(list.length,223);
  assert.ok(!Object.hasOwn(list[0],'body'));
  const teamMeta=list.find(p=>p.slug==='teams'),homeMeta=list.find(p=>p.kind==='home');
  const teams=(await api('pages/'+teamMeta.id,'GET',null,editor.cookie)).body;
  assert.ok(teams.body.includes('U10 - SPIELRUNDE'));
  const initialHome=await (await getPage('/')).text();
  assert.ok(initialHome.includes('class="hero"'));
  assert.ok(initialHome.includes('class="button accent"'));
  assert.equal([...initialHome.matchAll(/id="news-grid"/g)].length,1);
  assert.ok(!initialHome.includes('{{AKTUELLE_BEITRAEGE}}'));

  const draft={title:'Unsere Ferienangebote',slug:'ferienangebote',body:'<h2>Basketballferien</h2><p>Alle Kinder sind willkommen.</p>',format:'html',status:'draft',menu_visible:true,kind:'home',path:'/'};
  assert.equal((await api('pages','POST',draft,null)).status,401);
  assert.equal((await api('pages','POST',draft,editor.cookie,'https://evil.invalid')).status,403);
  const created=await api('pages','POST',draft,editor.cookie);
  assert.equal(created.status,201);assert.equal(created.body.path,'/seiten/ferienangebote.html');
  assert.equal((await getPage(created.body.path)).status,404);
  assert.equal((await getPage(created.body.path+'?preview=1')).status,404);
  const preview=await getPage(created.body.path+'?preview=1',editor.cookie);
  assert.equal(preview.status,200);assert.equal(preview.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.ok((await preview.text()).includes('nicht veröffentlicht'));
  assert.ok(!(await api('navigation')).body.some(p=>p.path===created.body.path));
  assert.equal((await api('pages','POST',draft,editor.cookie)).status,409);
  assert.equal((await api('pages','POST',{...draft,slug:'../index'},editor.cookie)).status,400);

  const page=(await api('pages/'+created.body.id,'GET',null,editor.cookie)).body;
  assert.equal(page.kind,'page');
  const published=await api('pages','POST',{...page,status:'published',body:'<div class="content" onclick="alert(1)"><h2>Ferienprogramm</h2><script>alert(1)</script><img src="/assets/original/123abc.jpg" onerror="alert(1)"><a href="javascript:alert(1)">Unzulässig</a><a href="/seiten/teams.html">Teams</a></div>'},editor.cookie);
  assert.equal(published.status,200);
  const publicPage=await getPage(page.path);
  assert.equal(publicPage.status,200);
  const publicHtml=await publicPage.text();
  assert.ok(publicHtml.includes('Ferienprogramm'));
  assert.ok(publicHtml.includes('src="/assets/original/123abc.jpg"'));
  assert.doesNotMatch(publicHtml,/onclick|onerror|javascript:|<script/);
  assert.ok((await api('navigation')).body.some(p=>p.path===page.path));
  assert.ok((await (await getPage('/')).text()).includes('href="/seiten/ferienangebote.html"'));
  assert.ok((await (await getPage('/seiten/teams.html')).text()).includes('href="/seiten/ferienangebote.html"'));
  assert.equal((await api('pages','POST',{...page,title:'Veralteter Stand'},editor.cookie)).status,409);
  assert.equal((await api('pages','POST',{...page,version:published.body.version,slug:'neue-adresse'},editor.cookie)).status,400);

  const home=(await api('pages/'+homeMeta.id,'GET',null,owner.cookie)).body;
  assert.equal((await api('pages','POST',{...home,status:'draft'},owner.cookie)).status,400);
  const homeSaved=await api('pages','POST',{...home,body:home.body.replace('Gemeinsam.','Zusammen.')},owner.cookie);
  assert.equal(homeSaved.status,200);
  const updatedHome=await (await getPage('/index.html')).text();
  assert.ok(updatedHome.includes('Zusammen.'));
  assert.equal([...updatedHome.matchAll(/id="news-grid"/g)].length,1);

  const hidden=await api('pages','POST',{...teams,status:'draft'},editor.cookie);
  assert.equal(hidden.status,200);
  assert.equal((await getPage('/seiten/teams.html')).status,404);
  assert.ok(!(await api('navigation')).body.some(p=>p.slug==='teams'));
  const plain=await api('pages','POST',{title:'Textseite',slug:'textseite',body:'<script>Text, kein HTML</script>',format:'text',status:'published',menu_visible:false},editor.cookie);
  assert.equal(plain.status,201);
  const textHtml=await (await getPage(plain.body.path)).text();
  assert.ok(textHtml.includes('&lt;script&gt;Text, kein HTML&lt;/script&gt;'));

  await stop();await start();
  assert.equal((await getPage('/seiten/teams.html')).status,404);
  assert.ok((await (await getPage('/')).text()).includes('Zusammen.'));
  assert.ok((await (await getPage(page.path)).text()).includes('Ferienprogramm'));
  assert.equal((await api('pages','GET',null,editor.cookie)).body.length,list.length+2);
 }finally{if(child)await stop();rmSync(dir,{recursive:true,force:true})}
});
