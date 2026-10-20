// Explicit local administration; never exposed over HTTP.
import {DatabaseSync} from 'node:sqlite';
import {createInterface} from 'node:readline/promises';
import {hash,validPassword} from '../security.mjs';
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Run interactively in a local terminal.');
const db=new DatabaseSync(process.env.DB_PATH||'data/club.sqlite');
const rl=createInterface({input:process.stdin,output:process.stdout});
try{
 if(db.prepare('SELECT id FROM users LIMIT 1').get())throw Error('Setup already completed.');
 const email=(await rl.question('Administrator email: ')).trim().toLowerCase();
 // Use a terminal-local hidden prompt so the password is not in argv/history/logs.
 rl.close();
 process.stdout.write('Password (12–256 characters): ');process.stdin.setRawMode(true);process.stdin.resume();
 const password=await new Promise((resolve,reject)=>{let value='';const listener=chunk=>{for(const char of chunk.toString()){if(char==='\u0003'){process.stdin.off('data',listener);reject(Error('Cancelled'));return}if(char==='\r'||char==='\n'){process.stdin.off('data',listener);resolve(value);return}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else value+=char}};process.stdin.on('data',listener)});
 process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');
 if(!/^\S+@\S+\.\S+$/.test(email)||!validPassword(password))throw Error('Invalid email or password.');
 const stored=await hash(password);
 db.exec('BEGIN IMMEDIATE');try{if(db.prepare('SELECT id FROM users LIMIT 1').get())throw Error('Setup already completed.');db.prepare('INSERT INTO users(email,password,role) VALUES(?,?,?)').run(email,stored,'superadmin');db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 console.log('Administrator created.');
}finally{if(process.stdin.isRaw)process.stdin.setRawMode(false);process.stdin.pause();rl.close();db.close()}
