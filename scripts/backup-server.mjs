import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,statSync,unlinkSync,chmodSync,copyFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
const dir='/var/backups/ladybaskets';
mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
const path=join(dir,'club-'+new Date().toISOString().replaceAll(':','-')+'.sqlite');
const db=new DatabaseSync('/opt/ladybaskets/app/data/club.sqlite',{readOnly:true});
try{db.prepare('VACUUM INTO ?').run(path)}finally{db.close()}
chmodSync(path,0o600);
// Validate a separate restored database, not the live one.
const restored=new DatabaseSync(path,{readOnly:true});
try{if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed');for(const table of ['users','sessions','articles','members','pages'])restored.prepare('SELECT count(*) FROM '+table).get()}finally{restored.close()}
copyFileSync(path,join(dir,'latest.tmp'));chmodSync(join(dir,'latest.tmp'),0o600);renameSync(join(dir,'latest.tmp'),join(dir,'latest.sqlite'));
for(const name of readdirSync(dir))if(/^club-[\dTZ.:-]+\.sqlite$/.test(name)&&Date.now()-statSync(join(dir,name)).mtimeMs>30*86400000)unlinkSync(join(dir,name));
console.log('Verified SQLite backup: '+path);
