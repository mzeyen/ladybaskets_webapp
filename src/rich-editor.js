import {Editor,Node} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {TableKit} from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import {isLocalImagePath,maxImageBytes} from '../media-policy.mjs';
export {isLocalImagePath} from '../media-policy.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=new Set();
export function destroyEditors(){for(const editor of [...active])editor.destroy()}
const alignments=['left','center','right','justify'];
const Alignment=TextAlign.extend({addGlobalAttributes(){return [{types:['paragraph','heading'],attributes:{textAlign:{default:null,parseHTML:el=>{const v=el.getAttribute('data-align')||el.style.textAlign;return alignments.includes(v)?v:null},renderHTML:a=>alignments.includes(a.textAlign)?{'data-align':a.textAlign}:{}}}}]}});
const Figure=Node.create({name:'figure',group:'block',content:'block*',parseHTML:()=>[{tag:'figure'}],renderHTML:()=>['figure',0]});
const Caption=Node.create({name:'figcaption',group:'block',content:'inline*',parseHTML:()=>[{tag:'figcaption'}],renderHTML:()=>['figcaption',0]});
const LocalImage=Image.extend({parseHTML(){return [{tag:'img[src]',getAttrs:el=>isLocalImagePath(el.getAttribute('src'))?null:false}]}});

export function createRichEditor(host,{content='',label='Inhalt',onChange=()=>{}}={}){
 host.classList.add('tiptap-shell');
 host.innerHTML='<div class="tiptap-toolbar" role="toolbar" aria-label="Text formatieren"></div><div class="tiptap-tools" hidden></div><div class="tiptap-content"></div><div class="tiptap-status" aria-live="polite"></div>';
 const toolbar=host.querySelector('.tiptap-toolbar'),tools=host.querySelector('.tiptap-tools'),status=host.querySelector('.tiptap-status');
 tools.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();tools.querySelector('[data-apply]')?.click()}});
 const editor=new Editor({element:host.querySelector('.tiptap-content'),injectCSS:false,
  extensions:[StarterKit.configure({heading:{levels:[2,3,4]},link:{openOnClick:false,autolink:false,linkOnPaste:false},codeBlock:{HTMLAttributes:{class:'editor-code'}},dropcursor:false}),LocalImage.configure({allowBase64:false}),TableKit.configure({table:{resizable:false}}),Alignment.configure({types:['heading','paragraph']}),Figure,Caption],
  content,editorProps:{attributes:{class:'tiptap prose-editor',role:'textbox','aria-label':label,'aria-multiline':'true'}},
  onUpdate:()=>{update();onChange(editor.getHTML())},onSelectionUpdate:()=>update()});
 const buttons=[];
 const action=(label,command,isActive)=>{
  const button=document.createElement('button');button.type='button';button.textContent=label;button.title=label;button.setAttribute('aria-label',label);button.onmousedown=e=>e.preventDefault();button.onclick=()=>{command();update()};toolbar.append(button);buttons.push({button,isActive});return button;
 };
 const format=document.createElement('select');format.setAttribute('aria-label','Absatzformat');format.innerHTML='<option value="p">Absatz</option><option value="2">Überschrift 2</option><option value="3">Überschrift 3</option><option value="4">Überschrift 4</option>';
 format.onchange=()=>{const chain=editor.chain().focus();format.value==='p'?chain.setParagraph().run():chain.setHeading({level:Number(format.value)}).run()};toolbar.append(format);
 for(const [label,command,mark] of [['Fett','toggleBold','bold'],['Kursiv','toggleItalic','italic'],['Unterstrichen','toggleUnderline','underline'],['Durchgestrichen','toggleStrike','strike']])action(label,()=>editor.chain().focus()[command]().run(),()=>editor.isActive(mark));
 for(const [label,command,mark] of [['Aufzählung','toggleBulletList','bulletList'],['Nummerierung','toggleOrderedList','orderedList'],['Zitat','toggleBlockquote','blockquote']])action(label,()=>editor.chain().focus()[command]().run(),()=>editor.isActive(mark));
 for(const [label,align] of [['Links','left'],['Zentriert','center'],['Rechts','right']])action(label,()=>editor.chain().focus().setTextAlign(align).run(),()=>editor.isActive({textAlign:align}));
 function panel(html){tools.hidden=false;tools.innerHTML=html;tools.querySelector('[data-close]')?.addEventListener('click',()=>{tools.hidden=true;editor.commands.focus()})}
 action('Link',()=>{
  const selection=editor.state.selection;
  panel('<label>Link-Adresse<input data-url placeholder="https://… oder /seiten/…"></label><div class="tiptap-panel-actions"><button type="button" data-apply>Übernehmen</button><button type="button" data-unlink>Link entfernen</button><button type="button" data-close>Schließen</button></div><p class="error" data-error></p>');
  tools.querySelector('[data-url]').value=editor.getAttributes('link').href||'';
  tools.querySelector('[data-apply]').onclick=()=>{const href=tools.querySelector('[data-url]').value.trim();if(!/^(?:#[a-z][\w:-]*$|https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(href)||/[\s\\]/.test(href)){tools.querySelector('[data-error]').textContent='Bitte eine gültige Link-Adresse eingeben.';return}editor.chain().focus().setTextSelection(selection).extendMarkRange('link').setLink({href}).run();tools.hidden=true};
  tools.querySelector('[data-unlink]').onclick=()=>{editor.chain().focus().setTextSelection(selection).extendMarkRange('link').unsetLink().run();tools.hidden=true};
 },()=>editor.isActive('link'));
 action('Bild',async()=>{
  const selection=editor.state.selection;
  panel('<label>Alternativtext<input data-alt placeholder="Kurze Bildbeschreibung"></label><div class="tiptap-upload"><label>Neues Bild hochladen<input data-upload type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"></label><p class="help">JPEG, PNG oder WebP · maximal 5 MB. Das Bild wird optimiert und nach dem Upload direkt eingefügt.</p><button type="button" data-upload-button disabled>Hochladen und einfügen</button><p data-upload-status role="status"></p></div><p>Oder ein Bild aus der Mediathek auswählen</p><label>Bild suchen<input data-search type="search"></label><div class="tiptap-image-grid"></div><button type="button" data-more>Weitere Bilder</button><button type="button" data-close>Schließen</button><p class="error" data-error></p>');
  const current=tools.querySelector('.tiptap-image-grid');
  const fileInput=tools.querySelector('[data-upload]'),uploadButton=tools.querySelector('[data-upload-button]'),uploadStatus=tools.querySelector('[data-upload-status]');
  fileInput.onchange=()=>{uploadButton.disabled=!fileInput.files.length;uploadStatus.textContent=''};
  uploadButton.onclick=async()=>{
   const file=fileInput.files[0];if(!file)return;
   const mime={'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp'}[file.name.split('.').at(-1).toLowerCase()];
   if(!mime){uploadStatus.textContent='Bitte ein JPEG-, PNG- oder WebP-Bild auswählen.';return}
   if(file.size>maxImageBytes){uploadStatus.textContent='Das Bild ist zu groß. Erlaubt sind maximal 5 MB.';return}
   uploadButton.disabled=true;fileInput.disabled=true;uploadStatus.textContent='Bild wird hochgeladen und optimiert …';
   try{
    const response=await fetch('/api/images',{method:'POST',headers:{'Content-Type':mime,'X-File-Name':encodeURIComponent(file.name)},body:file});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Upload fehlgeschlagen.');
    if(!isLocalImagePath(data.path))throw Error('Ungültige Bildadresse.');
    if(editor.isDestroyed||!current.isConnected)return;
    const at=Math.min(selection.from,editor.state.doc.content.size);
    editor.chain().focus().setTextSelection(at).setImage({src:data.path,alt:tools.querySelector('[data-alt]').value}).run();tools.hidden=true;
   }catch(error){if(current.isConnected){uploadStatus.textContent=error.message;uploadButton.disabled=false;fileInput.disabled=false}}
  };
  try{
   const response=await fetch('/api/images');if(!response.ok)throw Error();const images=await response.json();
   if(!current.isConnected)return;
   let limit=9;
   const render=()=>{const query=tools.querySelector('[data-search]').value.toLowerCase();const filtered=images.filter(i=>i.label.toLowerCase().includes(query));current.innerHTML=filtered.slice(0,limit).map(i=>`<button type="button" data-image="${esc(i.path)}" title="${esc(i.label)}"><img src="${esc(i.path)}" alt="${esc(i.label)}" loading="lazy"></button>`).join('');tools.querySelector('[data-more]').hidden=filtered.length<=limit;for(const button of current.querySelectorAll('[data-image]'))button.onclick=()=>{editor.chain().focus().setTextSelection(selection).setImage({src:button.dataset.image,alt:tools.querySelector('[data-alt]').value}).run();tools.hidden=true}};
   tools.querySelector('[data-search]').oninput=()=>{limit=9;render()};tools.querySelector('[data-more]').onclick=()=>{limit+=9;render()};render();
  }catch{if(current.isConnected)tools.querySelector('[data-error]').textContent='Bilder konnten nicht geladen werden.'}
 });
 action('Tabelle',()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run());
 const tableButtons=[];
 for(const [label,cmd] of [['Zeile +','addRowAfter'],['Spalte +','addColumnAfter'],['Zeile −','deleteRow'],['Spalte −','deleteColumn'],['Verbinden','mergeCells'],['Zelle teilen','splitCell'],['Tabelle entfernen','deleteTable']])tableButtons.push(action(label,()=>editor.chain().focus()[cmd]().run()));
 action('Trennlinie',()=>editor.chain().focus().setHorizontalRule().run());
 action('Format löschen',()=>editor.chain().focus().unsetAllMarks().clearNodes().run());
 const undo=action('Rückgängig',()=>editor.chain().focus().undo().run());const redo=action('Wiederholen',()=>editor.chain().focus().redo().run());
 function update(){
  if(editor.isDestroyed)return;
  for(const {button,isActive} of buttons)if(isActive)button.setAttribute('aria-pressed',String(isActive()));
  for(const button of tableButtons)button.hidden=!editor.isActive('table');
  undo.disabled=!editor.can().undo();redo.disabled=!editor.can().redo();
  format.value=String(editor.getAttributes('heading').level||'p');
  status.textContent=editor.getText().length+' Zeichen · Tiptap';
 }
 const handle={getHTML:()=>editor.getHTML(),getText:()=>editor.getText(),setContent:html=>editor.commands.setContent(html),focus:()=>editor.commands.focus(),destroy:()=>{if(editor.isDestroyed)return;editor.destroy();active.delete(handle)}};
 active.add(handle);update();return handle;
}
