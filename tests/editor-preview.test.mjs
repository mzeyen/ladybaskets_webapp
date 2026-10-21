import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import sharp from 'sharp';

test('Tiptap-Vorschau bleibt lokal und bereinigt Formatierungen vor der Vorschau',async()=>{
 for(const [enabled,production] of [[true,false],[false,false],[true,true]]){
  const folder=mkdtempSync(join(tmpdir(),'ladybaskets-editor-'));
  const base='http://127.0.0.1:3091',origin=production?'https://example.org':base;
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,DB_PATH:join(folder,'test.sqlite'),PORT:'3091',HOST:'127.0.0.1',LOCAL_EDITOR_DEMO:enabled?'1':'0',NODE_ENV:production?'production':'development',COOKIE_SECURE:'1',PUBLIC_ORIGIN:origin,ALLOW_SETUP:'0'},stdio:['ignore','pipe','pipe']});
  child.stderr.resume();
  try{
   await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Testserver beendet')})]);
   assert.equal((await fetch(base+'/editor-demo.html')).status,enabled&&!production?200:404);
   const response=await fetch(base+'/api/editor-preview',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({html:'<p data-align="center" style="color:red" onclick="bad()">Test</p><script>bad()</script><table><tbody><tr><td colspan="2">Zelle</td></tr></tbody></table>'})});
   assert.equal(response.status,enabled&&!production?200:401);
   if(response.ok){const {html}=await response.json();assert.match(html,/<p data-align="center">Test<\/p>/);assert.match(html,/<td colspan="2">Zelle<\/td>/);assert.doesNotMatch(html,/script|style=|onclick/)}
   const file=await sharp({create:{width:2,height:2,channels:3,background:'#111052'}}).png().toBuffer();
   const upload=await fetch(base+'/api/images',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png'},body:file});
   assert.equal(upload.status,enabled&&!production?201:401);await upload.json();
  }finally{const stopped=once(child,'exit');child.kill();await stopped;rmSync(folder,{recursive:true,force:true})}
 }
});
