import {DatabaseSync} from 'node:sqlite';
if(!process.argv.includes('--confirm'))throw Error('Use --confirm to sign out all users.');
const db=new DatabaseSync(process.env.DB_PATH||'data/club.sqlite');
try{db.exec('DELETE FROM sessions');console.log('All sessions revoked.')}finally{db.close()}
