// The connection loop lives in the service worker so it survives the popup closing and is not
// throttled like a hidden tab. The popup (controller.html) only sends commands and shows status.
import {pageAction} from './automation.js';
import {readActionResult} from './results.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state={running:false,target:null,title:'',status:'未连接'};
let session=crypto.randomUUID();let connection;let heartbeat;let loopActive=false;

function setStatus(text){state.status=text;state.service=Boolean(port);chrome.runtime.sendMessage({type:'state',state}).catch(()=>{});}
async function rpc(route,body){
  let response;
  try{response=await fetch(connection.url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${connection.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});}
  catch(e){if(e instanceof TypeError)throw new Error('BRIDGE_UNREACHABLE');throw e;}
  const value=await response.json();if(!value||typeof value!=='object')throw new Error(`BRIDGE_INVALID_RESPONSE: ${route.split('?')[0]}`);if(!response.ok)throw new Error(value.error||`HTTP ${response.status}`);return value;
}
// The bridge can be briefly unreachable, e.g. while the native host takes the port over from a bridge
// that was started by hand. Retry for a few seconds before giving up.
async function rpcRetry(route,body,attempts=8){
  for(let i=1;;i++){
    try{return await rpc(route,body);}
    catch(e){if(e.message!=='BRIDGE_UNREACHABLE'||i>=attempts)throw e;await sleep(1000);}
  }
}
// Heartbeats can lapse (sleep, busy machine). The bridge accepts a fresh heartbeat from the same
// session once the old one is stale, so reclaim instead of dropping the connection.
async function reclaim(){await rpc('/heartbeat',{session});}
async function execute(tabId,action,payload){
  const tab=await chrome.tabs.get(tabId);
  if(!tab.url?.startsWith('https://chatgpt.com/'))throw new Error('TAB_CHANGED: choose ChatGPT tab again');
  const frames=await chrome.scripting.executeScript({target:{tabId},func:pageAction,args:[action,payload||{}]});return readActionResult(action,frames);
}
async function active(job){if(!state.running||Date.now()>=job.deadline||!(await rpc('/active/'+job.id)).active)throw new Error('JOB_EXPIRED: inspect page before retrying');}
async function perform(job){
  const tabId=state.target;
  await active(job);
  // Compare conversation ids, not full URLs: ChatGPT adds query strings, uses /g/<gpt-or-project>/c/<id>,
  // and a new chat may get a temporary id before the real one. Only a switch between two real ids fails.
  const idOf=url=>new URL(url).pathname.match(/\/c\/([^/]+)/)?.[1]||null;
  const realId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
  let conversation=(await execute(tabId,'context')).url;
  const checkConversation=async()=>{
    const current=(await execute(tabId,'context')).url;
    const before=idOf(conversation),after=idOf(current);
    if(before===after){conversation=current;return;}
    if(!after)throw new Error(`CONVERSATION_CHANGED: left the conversation (${new URL(conversation).pathname} -> ${new URL(current).pathname})`);
    if(!before||!realId(before)){conversation=current;return;}
    throw new Error(`CONVERSATION_CHANGED: stopped to avoid reading another conversation (${new URL(conversation).pathname} -> ${new URL(current).pathname})`);
  };
  const r=job.request;const refs=r.references||[];
  const files=[...(r.input?[{name:'edit-input.png',data:r.input}]:[]),...refs.map((data,i)=>({name:`reference-${i+1}.png`,data}))];
  const lead=r.input&&refs.length?`请编辑第一张图片（edit-input.png），并参考其余 ${refs.length} 张参考图的画风、配色和角色造型。`
    :r.input?'请编辑我上传的图片并返回图片。'
    :refs.length?`请参考我上传的 ${refs.length} 张参考图的画风、配色和角色造型，生成一张新图片（不要只是修改参考图）并返回图片。`
    :'请生成图片并返回图片。';
  const baseline=await execute(tabId,'prepare',{files,text:`${lead}期望尺寸 ${r.size}，质量 ${r.quality}，背景 ${r.background}。\n${r.prompt}`});
  // Uploads can take a while, more so with several reference images.
  const hasInput=files.length>0;let ready;
  for(let i=0;i<30+files.length*20;i++){await active(job);await checkConversation();ready=await execute(tabId,'ready',{hasInput});if(ready.ready)break;await sleep(500);}
  if(!ready?.ready)throw new Error(`UPLOAD_OR_SEND_TIMEOUT: ${ready?.reason||'UNKNOWN'}; inspect draft; no submission retry. 页面诊断：${JSON.stringify(ready)}`);
  await active(job);await checkConversation();await execute(tabId,'submit',{hasInput});
  setStatus('已提交，等待图片。不要切换此 ChatGPT 标签页中的对话或输入其他消息。');
  // The prompt is submitted and quota spent. If the MCP side times out, keep waiting for a while and save
  // the image to the output folder's "late" subfolder instead of losing it.
  let late=false;const lateDeadline=()=>Date.now()>job.deadline+LATE_WAIT_MS;
  // After submit ChatGPT navigates "/" -> "/c/..."; an injected script interrupted by that returns no result, so keep waiting.
  while(true){
    await sleep(1000);
    if(!late){try{await active(job);}catch(e){if(!String(e.message).startsWith('JOB_EXPIRED'))throw e;late=true;setStatus('MCP 已超时，仍在等 ChatGPT 出图；出图后会另存到输出目录的 late 文件夹。不要切换此对话。');}}
    if(late&&(!state.running||lateDeadline()))throw new Error('JOB_EXPIRED: 超时后仍未拿到图片，请到 ChatGPT 页面查看');
    let result;try{await checkConversation();result=await execute(tabId,'poll',{baseline});}catch(e){if(String(e.message).startsWith('PAGE_RESULT_MISSING'))continue;throw e;}
    if(result.data){if(!late)return result.data;return {late:(await rpc('/late',{session,data:result.data})).path};}
  }
}
const LATE_WAIT_MS=10*60*1000;
function stop(text){state.running=false;clearInterval(heartbeat);setStatus(text||state.status);}
async function connect(tabId,title){
  if(state.running||loopActive)return;
  loopActive=true;
  try{
    if(!tabId)throw new Error('请先选择 ChatGPT 标签页');
    state.target=tabId;state.title=title||'';
    connection=await (await fetch(chrome.runtime.getURL('connection.json'))).json();
    if(connection.url!=='http://127.0.0.1:43127'||!/^[a-f0-9]{64}$/.test(connection.token))throw new Error('连接配置无效：请点“关闭”再“启动”；仍不行请重新运行安装脚本并重新加载扩展');
    session=crypto.randomUUID();
    await rpcRetry('/heartbeat',{session});state.running=true;
    heartbeat=setInterval(()=>{void rpc('/heartbeat',{session}).catch(e=>{if(e.message==='ANOTHER_CONTROLLER_CONNECTED')stop('另一个连接已接管，本连接已停止。');});},4000);
    setStatus('已连接，等待 MCP 生图请求。');
    while(state.running){
      // Any extension API call resets the service worker idle timer, keeping the loop alive while idle.
      await chrome.runtime.getPlatformInfo();
      let job;
      try{job=await rpcRetry('/next?session='+session);}
      catch(e){if(e.message==='SESSION_EXPIRED'){await reclaim();continue;}throw e;}
      if(job.id){
        let outcome;try{const done=await perform(job);outcome=typeof done==='string'?{data:done}:{late:done.late};}catch(e){outcome={error:e.message.slice(0,2000)};}
        if(outcome.late){setStatus(`MCP 已超时，但图片已另存到：${outcome.late}。继续等待新任务。`);await sleep(1000);continue;}
        const deliver=()=>rpc('/result',{id:job.id,session,...outcome});
        try{await deliver();}
        catch(e){
          // The MCP side already gave up on this job (timeout). Report it, but keep the connection for the next job.
          if(e.message==='JOB_EXPIRED'){setStatus(`任务已超时：${outcome.error||'图片已生成但 MCP 不再等待'}。请检查 ChatGPT，切勿直接重复提交。继续等待新任务。`);await sleep(1000);continue;}
          if(e.message!=='SESSION_EXPIRED'){stop(`${e.message}；请检查 ChatGPT，切勿直接重复提交。`);break;}
          try{await reclaim();await deliver();}catch(e2){stop(`${e2.message}；请检查 ChatGPT，切勿直接重复提交。`);break;}
        }
        setStatus(outcome.error?`任务失败：${outcome.error}`:'图片已传回 MCP。继续等待新任务。');
      }
      await sleep(1000);
    }
  }catch(e){stop(e.message==='BRIDGE_UNREACHABLE'?'本地服务没有响应。请点“关闭”后重新“启动”；仍不行请查看安装目录 logs\\bridge.log。':`${e.message}。请点“关闭”后重新“启动”。`);}
  finally{loopActive=false;state.running=false;clearInterval(heartbeat);setStatus(state.status);}
}

// The local bridge runs as a Chrome native messaging host: connectNative starts it, disconnecting
// (or Chrome exiting) closes its stdin and it shuts down.
const HOST='com.personal.image_mcp';let port=null;
function startService(tabId,title){
  if(state.running||loopActive)return;
  if(!tabId){setStatus('请先选择 ChatGPT 标签页');return;}
  if(port){void connect(tabId,title);return;}
  setStatus('正在启动本地生图服务…');
  port=chrome.runtime.connectNative(HOST);
  port.onMessage.addListener(msg=>{
    if(msg?.ok){void connect(tabId,title);}
    else{setStatus(`服务启动失败：${msg?.error||'未知错误'}`);port?.disconnect();port=null;}
  });
  port.onDisconnect.addListener(()=>{
    const reason=chrome.runtime.lastError?.message;port=null;
    if(state.running)stop(`本地服务已退出${reason?`：${reason}`:''}`);
    else if(reason)setStatus(/not found/i.test(reason)
      ?`找不到本地服务（${reason}）。请先运行安装脚本 install.cmd，然后完全退出 Chrome（任务管理器里没有 chrome.exe）再重新打开。`
      :/forbidden/i.test(reason)?`本地服务拒绝了这个扩展（${reason}）。请重新运行安装脚本，并确认扩展 ID 为 ${chrome.runtime.id}。`
      :`无法启动本地服务：${reason}。详情见安装目录 logs\\bridge.log。`);
  });
}
function stopService(){
  stop('已关闭本地生图服务。已提交的 ChatGPT 请求无法撤回。');
  if(port){port.disconnect();port=null;}
}

chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  if(msg?.type==='getState'){state.service=Boolean(port);sendResponse(state);return;}
  if(msg?.type==='connect'){startService(msg.tabId,msg.title);sendResponse(state);return;}
  if(msg?.type==='stop'){stopService();sendResponse(state);return;}
  if(msg?.type==='diagnose'){execute(msg.tabId,'ready').then(r=>sendResponse({ok:true,result:r}),e=>sendResponse({ok:false,error:e.message}));return true;}
});
