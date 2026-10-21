import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {maxImageBytes,maxImagePixels} from './media-policy.mjs';

export class ImageUploadError extends Error{
 constructor(status,message){super(message);this.status=status}
}

export async function readImageBody(req){
 if(Number(req.headers['content-length'])>maxImageBytes){req.resume();throw new ImageUploadError(413,'Das Bild ist zu groß. Erlaubt sind maximal 5 MB.')}
 return new Promise((resolve,reject)=>{
  const chunks=[];let size=0;
  const cleanup=()=>{req.off('data',onData);req.off('end',onEnd);req.off('error',onError);req.off('aborted',onAbort)};
  const onError=error=>{cleanup();reject(error)};
  const onAbort=()=>onError(new ImageUploadError(400,'Der Upload wurde abgebrochen.'));
  const onData=chunk=>{size+=chunk.length;if(size>maxImageBytes){cleanup();req.resume();reject(new ImageUploadError(413,'Das Bild ist zu groß. Erlaubt sind maximal 5 MB.'))}else chunks.push(chunk)};
  const onEnd=()=>{cleanup();resolve(Buffer.concat(chunks))};
  req.on('data',onData);req.once('end',onEnd);req.once('error',onError);req.once('aborted',onAbort);
 });
}

export async function saveUploadedImage(input,{directory,contentType,name='Bild'}){
 if(input.length>maxImageBytes)throw new ImageUploadError(413,'Das Bild ist zu groß. Erlaubt sind maximal 5 MB.');
 const mime=contentType?.split(';')[0].trim().toLowerCase();
 const format=input.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpeg':input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP'?'webp':null;
 if(!format||mime!==`image/${format}`)throw new ImageUploadError(415,'Bitte ein gültiges JPEG-, PNG- oder WebP-Bild auswählen.');
 let data,info;
 try{
  const options={limitInputPixels:maxImagePixels,failOn:'warning'};
  const metadata=await sharp(input,options).metadata();
  if((metadata.pages||1)>1)throw new Error('Animated image');
  ({data,info}=await sharp(input,options).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true}));
 }catch{throw new ImageUploadError(422,'Das Bild kann nicht verarbeitet werden. Bitte ein unbeschädigtes, nicht animiertes Bild mit höchstens 40 Megapixeln verwenden.')}
 const hash=createHash('sha256').update(data).digest('hex');
 await mkdir(directory,{recursive:true,mode:0o700});
 try{await writeFile(join(directory,hash+'.webp'),data,{flag:'wx',mode:0o600})}catch(error){if(error.code!=='EEXIST')throw error}
 const label=String(name).replace(/^.*[\\/]/,'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120)||'Bild';
 return {hash,path:`/assets/uploads/${hash}.webp`,label,width:info.width,height:info.height,bytes:data.length};
}
