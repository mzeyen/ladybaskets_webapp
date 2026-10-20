const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function accountSettings({api,modal}){
 modal('<h2>Kontosicherheit</h2><form id="password-form"><label>Aktuelles Passwort<input name="current" type="password" autocomplete="current-password" required maxlength="256"></label><label>Neues Passwort (12 bis 256 Zeichen)<input name="next" type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label><p class="error" id="account-error" role="alert"></p><button class="button accent">Passwort ändern und überall abmelden</button></form><hr><button class="outline" id="revoke-self">Alle eigenen Sitzungen beenden</button>');
 document.querySelector('#password-form').onsubmit=async e=>{e.preventDefault();try{const f=e.currentTarget;await api('account/password','POST',{currentPassword:f.elements.current.value,password:f.elements.next.value});location.reload()}catch(error){document.querySelector('#account-error').textContent=error.message}};
 document.querySelector('#revoke-self').onclick=async()=>{try{await api('account/sessions','DELETE');location.reload()}catch(error){document.querySelector('#account-error').textContent=error.message}};
}
export function userControls(users,{api,modal,panel,toast}){
 const table=document.querySelector('#panel table');
 table.querySelector('thead tr').insertAdjacentHTML('beforeend','<th>Status / Sicherheit</th>');
 table.querySelectorAll('tbody tr').forEach((row,index)=>{
  const u=users[index],cell=document.createElement('td');
  cell.innerHTML=u.role==='superadmin'?'Aktiv':`${u.disabled?'Gesperrt':'Aktiv'} <button data-account="${u.id}">Verwalten</button>`;row.append(cell);
 });
 document.querySelectorAll('[data-account]').forEach(button=>button.onclick=()=>{
  const u=users.find(u=>u.id===Number(button.dataset.account));
  modal(`<h2>Zugang verwalten</h2><p>${esc(u.email)}</p><form id="manage-account"><label><input type="checkbox" name="disabled" ${u.disabled?'checked':''}> Zugang sperren</label><label>Neues Passwort (optional)<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256"></label><p>Beim Speichern werden alle Sitzungen dieses Kontos beendet.</p><p class="error" id="account-error" role="alert"></p><button class="button accent">Änderungen speichern</button></form>`);
  document.querySelector('#manage-account').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api('users/'+u.id,'PATCH',{disabled:f.elements.disabled.checked,revoke:true,...(f.elements.password.value?{password:f.elements.password.value}:{})});document.querySelector('#modal').close();await panel();toast('Zugang aktualisiert; Sitzungen beendet.')}catch(error){document.querySelector('#account-error').textContent=error.message}};
 });
}
