import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod/v4';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {EXTENSION_ORIGIN} from './extension-id.js';
const requestSchema=z.object({prompt:z.string().min(1).max(12000),size:z.string().max(30),quality:z.string().max(20),background:z.string().max(20),input:z.string().max(35_000_000).optional(),references:z.array(z.string().max(35_000_000)).max(4).optional()});
const resultSchema=z.object({id:z.string().uuid(),session:z.string().uuid(),data:z.string().max(35_000_000).optional(),error:z.string().max(2000).optional()}).refine(x=>Boolean(x.data)!==Boolean(x.error));
const lateSchema=z.object({session:z.string().uuid(),data:z.string().min(1).max(35_000_000)});
// lateDir: where images that arrive after the MCP request timed out are saved instead of being lost.
export function createBridge(token:string,timeout=300000,log:(message:string)=>void=()=>{},lateDir?:string){
  let owner:{session:string,time:number}|undefined;
  let job:{id:string;request:z.infer<typeof requestSchema>;sent:boolean;response:ServerResponse;timer:ReturnType<typeof setTimeout>}|undefined;
  const reply=(res:ServerResponse,status:number,value:unknown)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}};
  async function body(req:IncomingMessage){let total=0;const chunks:Buffer[]=[];for await(const chunk of req){total+=chunk.length;if(total>100_000_000)throw new Error('BODY_TOO_LARGE');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
  const clear=()=>{if(job)clearTimeout(job.timer);job=undefined;};
  const server=createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&origin!==EXTENSION_ORIGIN){reply(res,403,{error:'ORIGIN_DENIED'});return;}
    if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){reply(res,403,{error:'HOST_DENIED'});return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const provided=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(token);
    if(provided.length!==expected.length||!timingSafeEqual(provided,expected)){reply(res,401,{error:'AUTH_REQUIRED'});return;}
    try{
      if(req.method==='GET'&&req.url==='/status'){reply(res,200,{connected:Boolean(owner&&Date.now()-owner.time<15000),busy:Boolean(job)});return;}
      if(req.method==='POST'&&req.url==='/heartbeat'){
        const {session}=z.object({session:z.string().uuid()}).parse(await body(req));
        if(owner&&owner.session!==session&&Date.now()-owner.time<15000){reply(res,409,{error:'ANOTHER_CONTROLLER_CONNECTED'});return;}
        owner={session,time:Date.now()};reply(res,200,{ok:true});return;
      }
      if(req.method==='POST'&&req.url==='/generate'){
        const request=requestSchema.parse(await body(req));
        if(job){reply(res,409,{error:'BUSY: another browser job is active'});return;}
        if(!owner||Date.now()-owner.time>=15000){reply(res,503,{error:'EXTENSION_OFFLINE: 在 Chrome 打开 ChatGPT，点扩展图标 → 启动'});return;}
        const id=randomUUID();const timer=setTimeout(()=>{if(job?.id===id){log(`job ${id} timed out after ${timeout}ms`);reply(res,504,{error:'TIMEOUT: check ChatGPT before retrying; quota may already be consumed'});clear();}},timeout);
        job={id,request,sent:false,response:res,timer};log(`job ${id} queued (${request.input?'edit':'generate'}, ${request.references?.length??0} reference image(s))`);
        res.on('close',()=>{if(job?.id===id){log(`job ${id} cancelled: MCP client closed the request`);clear();}});return;
      }
      if(req.method==='GET'&&req.url?.startsWith('/next?')){
        const session=new URL(req.url,'http://127.0.0.1').searchParams.get('session');
        if(!owner||owner.session!==session||Date.now()-owner.time>=15000){reply(res,403,{error:'SESSION_EXPIRED'});return;}
        if(job&&!job.sent){job.sent=true;reply(res,200,{id:job.id,request:job.request,deadline:Date.now()+timeout});}else reply(res,200,{idle:true});return;
      }
      if(req.method==='GET'&&req.url?.startsWith('/active/')){reply(res,200,{active:job?.id===req.url.slice(8)});return;}
      if(req.method==='POST'&&req.url==='/result'){
        const result=resultSchema.parse(await body(req));
        if(!owner||owner.session!==result.session){reply(res,403,{error:'SESSION_EXPIRED'});return;}
        if(!job||result.id!==job.id){reply(res,410,{error:'JOB_EXPIRED'});return;}
        log(`job ${job.id} ${result.error?`failed: ${result.error}`:`succeeded (${result.data!.length} base64 chars)`}`);
        reply(job.response,result.error?502:200,result.error?{error:result.error}:{data:result.data});clear();reply(res,200,{ok:true});return;
      }
      if(req.method==='POST'&&req.url==='/late'){
        const late=lateSchema.parse(await body(req));
        if(!owner||owner.session!==late.session){reply(res,403,{error:'SESSION_EXPIRED'});return;}
        if(!lateDir){reply(res,501,{error:'LATE_SAVE_UNAVAILABLE'});return;}
        const png=await sharp(Buffer.from(late.data,'base64')).png().toBuffer();
        await fs.mkdir(lateDir,{recursive:true});
        const file=path.join(lateDir,`late-${new Date().toISOString().replace(/[:.]/g,'-')}.png`);
        await fs.writeFile(file,png,{flag:'wx'});log(`late image saved to ${file}`);
        reply(res,200,{path:file});return;
      }
      reply(res,404,{error:'NOT_FOUND'});
    }catch(e){reply(res,400,{error:e instanceof z.ZodError?'INVALID_REQUEST':(e as Error).message});}
  });
  server.requestTimeout=timeout+10000;
  server.on('close',()=>{if(job){reply(job.response,503,{error:'BRIDGE_CLOSED'});clear();}});
  return server;
}
