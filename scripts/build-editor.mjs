import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const output='public/assets/editor';mkdirSync(output,{recursive:true});
await build({entryPoints:['src/rich-editor.js'],outfile:output+'/tiptap.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked'});
const report=JSON.parse(readFileSync('content/site-migration.json'));
const assignments=JSON.parse(readFileSync('content/home-original-images.json'));
const images=[...assignments.map(a=>({path:a.image,label:a.alt})),...report.assets.filter(a=>/\.(png|jpe?g|gif|webp)$/i.test(a.path)).map(a=>({path:a.path,label:decodeURIComponent(new URL(a.url).pathname.split('/').at(-1))}))];
writeFileSync(output+'/images.json',JSON.stringify([...new Map(images.map(a=>[a.path,a])).values()],null,2)+'\n');
const packages=readdirSync('node_modules').flatMap(n=>n.startsWith('@')?readdirSync(join('node_modules',n)).map(p=>join(n,p)):[n]);
const licenses=[];
for(const name of packages){const root=join('node_modules',name);if(!existsSync(join(root,'package.json')))continue;const file=readdirSync(root).find(f=>/^licen[sc]e(?:\.|$)/i.test(f));if(file)licenses.push(name+'\n'+readFileSync(join(root,file),'utf8'));}
writeFileSync(output+'/LICENSES.txt',licenses.join('\n\n'+'='.repeat(70)+'\n\n'));
console.log('Tiptap-Bundle, lokale Bildauswahl und Lizenzhinweise erstellt.');
