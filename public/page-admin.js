const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const marker='{{AKTUELLE_BEITRAEGE}}';
const fixedNews='<div class="page-news-placeholder" contenteditable="false" data-page-news="true">Aktuelle Beiträge werden hier automatisch angezeigt.</div>';

export async function showPages({api,modal,toast}){
 const pages=await api('pages');
 $('#panel').innerHTML=`<div class="panel-top"><h3>Seiten verwalten (${pages.length})</h3><button class="button accent" id="page-add">+ Seite anlegen</button></div><label for="page-search">Seiten durchsuchen</label><input id="page-search" type="search" placeholder="Titel oder Seitenadresse"><div class="table-wrap" id="page-table"></div>`;
 const open=async id=>{try{editPage(await api('pages/'+id))}catch(error){toast(error.message)}};
 function renderList(){
  const query=$('#page-search').value.trim().toLowerCase();
  const list=pages.filter(p=>(p.title+' '+p.path).toLowerCase().includes(query));
  $('#page-table').innerHTML=list.length?`<table><thead><tr><th>Seite</th><th>Status</th><th>Im Menü</th><th>Aktionen</th></tr></thead><tbody>${list.map(p=>`<tr><td>${esc(p.title)}<br><small class="muted">${esc(p.path)}</small></td><td><span class="status">${p.status==='published'?'Veröffentlicht':'Entwurf'}</span></td><td>${p.menu_visible?'Ja':'Nein'}</td><td><button data-page-edit="${p.id}">Bearbeiten</button><a class="page-preview" href="${esc(p.path)}?preview=1" target="_blank" rel="noopener">${p.status==='draft'?'Vorschau':'Ansehen'} ↗</a></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Keine passenden Seiten gefunden.</p>';
  document.querySelectorAll('[data-page-edit]').forEach(button=>button.onclick=()=>open(button.dataset.pageEdit));
 }
 $('#page-search').oninput=renderList;
 $('#page-add').onclick=()=>editPage();
 renderList();

 function editPage(page={}){
  const isHome=page.kind==='home';let mode=page.format||'html';
  modal(`<h2>${page.id?'Seite bearbeiten':'Neue Seite anlegen'}</h2><form id="page-form" class="page-editor"><label for="page-title">Seitentitel</label><input id="page-title" required maxlength="180" value="${esc(page.title)}"><label for="page-slug">Seitenadresse</label><input id="page-slug" required maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${esc(page.slug)}" ${page.id?'readonly':''}><p class="help">${page.id?`Adresse: ${esc(page.path)} · Bestehende Links bleiben erhalten.`:'Die Seite ist unter /seiten/deine-adresse.html erreichbar.'}</p><label for="page-mode">Editor</label><select id="page-mode" ${isHome?'disabled':''}><option value="html" ${mode==='html'?'selected':''}>Visueller Editor</option><option value="text" ${mode==='text'?'selected':''}>Reiner Text</option></select><label id="page-content-label">Inhalt</label><div class="toolbar" id="page-toolbar"><button type="button" data-page-cmd="bold" aria-label="Fett"><b>B</b></button><button type="button" data-page-cmd="italic" aria-label="Kursiv"><i>I</i></button><button type="button" data-page-cmd="formatBlock" data-value="h2">Überschrift</button><button type="button" data-page-cmd="insertUnorderedList">Liste</button><button type="button" id="page-link">Link</button><button type="button" data-page-cmd="removeFormat">Format löschen</button></div><div id="page-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="page-content-label"></div><textarea id="page-plain" aria-labelledby="page-content-label"></textarea><label for="page-status">Veröffentlichung</label><select id="page-status"><option value="draft" ${isHome?'disabled':''}>Als Entwurf speichern</option><option value="published" ${page.status==='published'||isHome?'selected':''}>Auf der Webseite veröffentlichen</option></select>${isHome?'<p class="help">Die Startseite bleibt erreichbar. Aktuelle Beiträge werden automatisch eingeblendet.</p>':'<label class="checkbox-label"><input type="checkbox" id="page-menu" '+(page.menu_visible||!page.id?'checked':'')+'> Im Menü anzeigen (nach Veröffentlichung)</label>'}<p class="error" id="page-error" role="alert"></p><button class="button accent" type="submit">Seite speichern →</button></form>`);
  const rich=$('#page-rich'),plain=$('#page-plain');
  if(mode==='html')rich.innerHTML=(page.body||'').replaceAll(marker,fixedNews);else plain.value=page.body||'';
  let slugTouched=!!page.id;
  $('#page-slug').oninput=()=>{slugTouched=true};
  $('#page-title').oninput=()=>{if(!slugTouched)$('#page-slug').value=$('#page-title').value.toLowerCase().replaceAll('ä','ae').replaceAll('ö','oe').replaceAll('ü','ue').replaceAll('ß','ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)};
  function sync(){rich.hidden=mode!=='html';plain.hidden=mode!=='text';$('#page-toolbar').hidden=mode!=='html'}
  sync();
  $('#page-mode').onchange=e=>{if(e.target.value==='text')plain.value=rich.innerText;else rich.innerHTML=plain.value.split('\n').map(line=>`<p>${esc(line)||'<br>'}</p>`).join('');mode=e.target.value;sync()};
  document.querySelectorAll('[data-page-cmd]').forEach(button=>{button.onmousedown=e=>e.preventDefault();button.onclick=()=>{rich.focus();document.execCommand(button.dataset.pageCmd,false,button.dataset.value||null)}});
  $('#page-link').onmousedown=e=>e.preventDefault();
  $('#page-link').onclick=()=>{
   const href=window.prompt('Link-Adresse (https://… oder /seiten/…):','https://');
   if(!href)return;
   if(!/^(?:https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(href)||/[\s\\]/.test(href)){ $('#page-error').textContent='Bitte eine gültige Link-Adresse eingeben.';return}
   rich.focus();document.execCommand('createLink',false,href);
  };
  rich.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});
  $('#page-form').onsubmit=async e=>{
   e.preventDefault();const submit=$('#page-form button[type="submit"]');submit.disabled=true;
   try{
    const clone=rich.cloneNode(true);clone.querySelectorAll('[data-page-news]').forEach(node=>node.replaceWith(document.createTextNode(marker)));
    const result=await api('pages','POST',{id:page.id,version:page.version,title:$('#page-title').value,slug:$('#page-slug').value,body:mode==='html'?clone.innerHTML:plain.value,format:mode,status:$('#page-status').value,menu_visible:!isHome&&$('#page-menu').checked});
    $('#modal').close();await showPages({api,modal,toast});toast(`Seite gespeichert: ${result.path}`);
   }catch(error){$('#page-error').textContent=error.message;submit.disabled=false}
  };
 }
}
