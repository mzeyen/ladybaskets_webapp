import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['server.mjs'],{stdio:'inherit',env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:process.env.PORT||'3000',DB_PATH:process.env.DB_PATH||'data/club.sqlite',LOCAL_EDITOR_DEMO:'1',ALLOW_SETUP:'0',COOKIE_SECURE:'0',PUBLIC_ORIGIN:''}});
child.on('exit',code=>process.exit(code??0));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>child.kill(event));
