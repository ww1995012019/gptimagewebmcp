import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createBridge} from '../src/bridge/http.js';
import {EXTENSION_ORIGIN} from '../src/bridge/extension-id.js';
test('extension bridge authentication, origin, exclusive controller, single delivery and image response',async()=>{
 const token='a'.repeat(64);const server=createBridge(token,2000);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const rpc=(route:string,body?:unknown,headers:Record<string,string>={})=>fetch(url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await fetch(url+'/status')).status,401);
  assert.equal((await rpc('/status',undefined,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await rpc('/status',undefined,{Origin:'chrome-extension://'+'a'.repeat(32)})).status,403);
  assert.equal((await rpc('/status',undefined,{Origin:EXTENSION_ORIGIN})).status,200);
  assert.equal((await rpc('/generate',{prompt:'x',size:'1024x1024',quality:'auto',background:'auto'})).status,503);
  const session=randomUUID();assert.equal((await rpc('/heartbeat',{session})).status,200);
  assert.equal((await rpc('/heartbeat',{session:randomUUID()})).status,409);
  assert.equal((await rpc('/generate',{prompt:''})).status,400);
  const pending=rpc('/generate',{prompt:'x',size:'1024x1024',quality:'auto',background:'auto'});
  // The pending HTTP request has no response until extension completes it.
  let job:any;for(let i=0;i<50;i++){job=await (await rpc('/next?session='+session)).json();if(job.id)break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(job.id);assert.equal((await (await rpc('/next?session='+session)).json()).idle,true);
  assert.equal((await rpc('/generate',{prompt:'y',size:'1024x1024',quality:'auto',background:'auto'})).status,409);
  assert.equal((await rpc('/result',{id:job.id,session,data:'aW1hZ2U='})).status,200);
  assert.equal((await (await pending).json()).data,'aW1hZ2U=');
  assert.equal((await rpc('/result',{id:job.id,session,data:'aW1hZ2U='})).status,410);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('extension bridge timeout is explicit and job is not redelivered',async()=>{
 const token='b'.repeat(64);const server=createBridge(token,100);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const rpc=(route:string,body?:unknown)=>fetch(url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{const session=randomUUID();await rpc('/heartbeat',{session});const response=await rpc('/generate',{prompt:'x',size:'1024x1024',quality:'auto',background:'auto'});assert.equal(response.status,504);assert.match((await response.json()).error,/TIMEOUT/);assert.equal((await (await rpc('/next?session='+session)).json()).idle,true);}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('images arriving after the MCP request timed out are saved to the late folder, only for the controller session',async()=>{
 const token='c'.repeat(64);const lateDir=await fs.mkdtemp(path.join(os.tmpdir(),'image-late-'));const server=createBridge(token,100,undefined,lateDir);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const rpc=(route:string,body?:unknown)=>fetch(url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const png=(await sharp({create:{width:8,height:8,channels:4,background:'blue'}}).png().toBuffer()).toString('base64');
 try{
  const session=randomUUID();await rpc('/heartbeat',{session});
  assert.equal((await rpc('/late',{session:randomUUID(),data:png})).status,403);
  const saved=await (await rpc('/late',{session,data:png})).json();
  assert.ok(saved.path.startsWith(lateDir));assert.equal((await sharp(await fs.readFile(saved.path)).metadata()).width,8);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(lateDir,{recursive:true,force:true});}
});
