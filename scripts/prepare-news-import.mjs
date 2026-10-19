import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const report=JSON.parse(readFileSync('content/site-migration.json','utf8'));
const existing=JSON.parse(readFileSync('content/articles.json','utf8'));
const seedIds=new Map([[278,existing[0]],[277,existing[1]],[274,existing[2]]]);
const records=[];
for(const page of report.pages){
 const match=page.url.match(/\/31-our-news\/(\d+)-/);
 if(!match)continue;
 const id=Number(match[1]);
 // These four entries are unchanged Latin demo content from the old template.
 if([65,66,67,68].includes(id))continue;
 const html=readFileSync('public'+page.path,'utf8');
 const body=html.split('<div class="import-content">')[1]?.split('</div></article></main>')[0].replace(/<h3>[\s\S]*?<\/h3>/,'').trim();
 if(!body)throw Error('Missing full article: '+page.url);
 records.push({source:'ladybaskets:'+id,title:page.title,category:/spielbericht|punkte|heimspiel|auswärts|punktspiel|turnier|meisterschaft/i.test(page.title)?'Spielbericht':'Vereinsleben',body,date:seedIds.get(id)?.date||'',existingTitle:seedIds.get(id)?.title||null,url:page.url});
}
const homeUrl='https://www.ladybaskets.de/index.php';
const key=createHash('sha256').update(homeUrl).digest('hex').slice(0,16);
const home=readFileSync('.migration/cache/'+key,'utf8');
for(const match of home.matchAll(/<article\b[^>]*id="item_(\d+)"[^>]*>([\s\S]*?)<\/article>/g)){
 const title=match[2].match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/)?.[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
 let body=match[2].match(/<div class="item_introtext">([\s\S]*?)<\/div>/)?.[1].trim();
 const figure=match[2].match(/<figure\b[^>]*>[\s\S]*?<\/figure>/)?.[0]||'';
 if(body)body=figure+body;
 for(const asset of report.assets){const original=new URL(asset.url);body=body?.replaceAll(original.pathname,asset.path).replaceAll(asset.url,asset.path)}
 const date=match[2].match(/datetime="(\d{4}-\d{2}-\d{2})/)?.[1]||'';
 if(title&&body&&!records.some(r=>r.source==='ladybaskets:'+match[1]))records.unshift({source:'ladybaskets:'+match[1],title,category:'Vereinsleben',body,date,existingTitle:null,url:homeUrl});
}
writeFileSync('content/imported-news.json',JSON.stringify(records,null,2)+'\n');
console.log(`${records.length} echte Vereinsbeiträge vorbereitet; 4 alte Demo-Texte ausgelassen.`);
