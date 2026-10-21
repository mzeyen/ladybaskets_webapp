import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import {saveUploadedImage,readImageBody} from '../image-uploads.mjs';
import {isLocalImagePath,maxImageBytes} from '../media-policy.mjs';

test('Bilder werden geprüft, begrenzt und ohne EXIF als WebP gespeichert',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'ladybaskets-upload-'));
 try{
  const input=await sharp({create:{width:3000,height:1000,channels:3,background:'#111052'}}).withExif({IFD0:{Artist:'Test metadata'}}).jpeg().toBuffer();
  const image=await saveUploadedImage(input,{directory,contentType:'image/jpeg',name:'../Testfoto.jpg'});
  assert.equal(image.label,'Testfoto.jpg');assert.equal(image.width,2400);assert.equal(image.height,800);
  assert.ok(isLocalImagePath(image.path));
  const output=await sharp(readFileSync(join(directory,image.hash+'.webp'))).metadata();
  assert.equal(output.format,'webp');assert.equal(output.exif,undefined);
  const duplicate=await saveUploadedImage(input,{directory,contentType:'image/jpeg'});
  assert.equal(duplicate.path,image.path);assert.equal(readdirSync(directory).length,1);
  await assert.rejects(saveUploadedImage(Buffer.from('<svg></svg>'),{directory,contentType:'image/png'}),{status:415});
  await assert.rejects(saveUploadedImage(Buffer.from([137,80,78,71,13,10,26,10]),{directory,contentType:'image/png'}),{status:422});
  await assert.rejects(saveUploadedImage(input,{directory,contentType:'image/png'}),{status:415});
  const request=Readable.from([Buffer.alloc(maxImageBytes),Buffer.from('x')]);request.headers={};
  await assert.rejects(readImageBody(request),{status:413});
  assert.equal(isLocalImagePath('/assets/uploads/../bad.webp'),false);
  assert.equal(isLocalImagePath('https://example.org/image.jpg'),false);
 }finally{rmSync(directory,{recursive:true,force:true})}
});

test('Upload, Mediathek und gespeicherte Beitragsbilder beachten Anmeldung und Origin',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'ladybaskets-media-api-'));
 const base='http://127.0.0.1:3090';
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,NODE_ENV:'development',DB_PATH:join(directory,'test.sqlite'),PORT:'3090',HOST:'127.0.0.1',LOCAL_EDITOR_DEMO:'0',ALLOW_SETUP:'1',COOKIE_SECURE:'0',PUBLIC_ORIGIN:base},stdio:['ignore','pipe','pipe']});child.stderr.resume();
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Testserver beendet')})]);
  const file=await sharp({create:{width:40,height:30,channels:4,background:'#f39402'}}).png().toBuffer();
  const upload=(cookie,origin=base,payload=file,type='image/png')=>fetch(base+'/api/images',{method:'POST',headers:{Origin:origin,'Content-Type':type,'X-File-Name':encodeURIComponent('Vereinsfoto.png'),...(cookie?{Cookie:cookie}:{})},body:payload});
  assert.equal((await upload()).status,401);
  assert.equal((await fetch(base+'/api/images')).status,401);
  const api=async(path,data,cookie)=>{const r=await fetch(base+'/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
  const credentials={email:'editor-test@example.org',password:'test-password-for-upload-123'};
  assert.equal((await api('setup',credentials)).status,201);
  const {cookie}=await api('login',credentials);
  assert.equal((await upload(cookie,'https://evil.invalid')).status,403);
  const response=await upload(cookie);assert.equal(response.status,201);const image=await response.json();
  const asset=await fetch(base+image.path);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/webp');await asset.arrayBuffer();
  const library=await(await fetch(base+'/api/images',{headers:{Cookie:cookie}})).json();assert.ok(library.some(item=>item.path===image.path));
  assert.equal((await upload(cookie)).status,201);
  const saved=await api('articles',{title:'Neues Vereinsfoto',category:'Vereinsleben',format:'html',status:'published',body:`<p>Ein Bild</p><img src="${image.path}" alt="Vereinsfoto">`},cookie);assert.equal(saved.status,200);
  const rows=await(await fetch(base+'/api/articles')).json();assert.ok(rows.find(row=>row.title==='Neues Vereinsfoto').body.includes(image.path));
  assert.equal((await upload(cookie,base,Buffer.from('<svg/>'),'image/svg+xml')).status,415);
  assert.equal((await upload(cookie,base,Buffer.alloc(maxImageBytes+1))).status,413);
 }finally{const stopped=once(child,'exit');child.kill();await stopped;rmSync(directory,{recursive:true,force:true})}
});
