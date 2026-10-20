import {randomBytes, scrypt, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export async function hash(password){const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password,salt,64)).toString('hex')}
export async function verify(password,stored){try{const [salt,key]=stored.split(':');const actual=await derive(password,salt,64),expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}}
export const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=256;
export function audit(event,fields={}){console.log(JSON.stringify({time:new Date().toISOString(),event,...fields}))}
export function loginLimiter(){
 const entries=new Map();let active=0;
 const digest=v=>createHash('sha256').update(v).digest('hex');
 return {
  enter(email,ip){
   const now=Date.now();for(const [k,v] of entries)if(v.until<=now)entries.delete(k);
   const keys=[['account:'+digest(email),10],['ip:'+ip,200]];
   if(active>=4||entries.size>20000||keys.some(([k,n])=>(entries.get(k)?.count||0)>=n))return null;
   for(const [k] of keys){const value=entries.get(k)||{count:0,until:now+900000};value.count++;entries.set(k,value)}
   active++;return ()=>{active--};
  }
 };
}
