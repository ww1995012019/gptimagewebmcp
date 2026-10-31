// Chrome Native Messaging host: Chrome starts this when the extension calls connectNative and
// closes stdin when the extension disconnects (or Chrome exits), which shuts the bridge down.
// stdout is reserved for the length-prefixed protocol; Chrome discards stderr, so logs go to logs/bridge.log.
import fs from 'node:fs';
import path from 'node:path';
import {initializeBridge} from './auth.js';
import {createBridge} from './http.js';
import {settings,project} from '../config.js';

const logDir=path.join(project,'logs');const logFile=path.join(logDir,'bridge.log');
function log(message:string){
  try{
    fs.mkdirSync(logDir,{recursive:true});
    if(fs.existsSync(logFile)&&fs.statSync(logFile).size>1024*1024)fs.renameSync(logFile,logFile+'.1');
    fs.appendFileSync(logFile,`${new Date().toISOString()} ${message}\n`);
  }catch{}
}
function send(message:unknown){
  const body=Buffer.from(JSON.stringify(message));const header=Buffer.alloc(4);header.writeUInt32LE(body.length,0);
  process.stdout.write(Buffer.concat([header,body]));
}
process.on('uncaughtException',e=>{log(`uncaught: ${e.stack||e.message}`);send({ok:false,error:`BRIDGE_FAILED: ${e.message}`});setTimeout(()=>process.exit(1),200);});

let token:string;
try{token=await initializeBridge();}
catch(e){log(`init failed: ${(e as Error).message}`);send({ok:false,error:`BRIDGE_INIT_FAILED: ${(e as Error).message}`});setTimeout(()=>process.exit(1),200);throw e;}
const server=createBridge(token,settings.timeout,log,path.join(settings.output,'late'));
const shutdown=(why:string)=>{log(`shutdown: ${why}`);server.closeAllConnections();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();};
let reported=false;
const listen=()=>server.listen(43127,'127.0.0.1');
server.on('listening',()=>{
  log(`listening on 127.0.0.1:43127 (pid ${process.pid}, timeout ${settings.timeout}ms)${reported?' after taking over from the external bridge':''}`);
  if(!reported){reported=true;send({ok:true,external:false});}
});
server.on('error',e=>{
  const code=(e as NodeJS.ErrnoException).code;
  if(code==='EADDRINUSE'){
    // A bridge started by hand (npm run bridge) already owns the port; the extension can use it now,
    // and this host keeps retrying so it takes over if that bridge exits.
    if(!reported){reported=true;log('port 43127 in use by another bridge; using it and retrying every 3s');send({ok:true,external:true});}
    setTimeout(listen,3000);return;
  }
  log(`server error: ${code||''} ${e.message}`);
  send({ok:false,error:`BRIDGE_FAILED: ${e.message}`});setTimeout(()=>process.exit(1),200);
});
listen();
process.stdin.on('data',()=>{});
process.stdin.on('end',()=>shutdown('extension disconnected'));
process.stdin.on('close',()=>shutdown('stdin closed'));
