// Toolbar popup: picks a ChatGPT tab (the current one by default) and drives the background loop.
const status=document.querySelector('#status');const select=document.querySelector('#tabs');
const connectBtn=document.querySelector('#connect');const stopBtn=document.querySelector('#stop');
const send=msg=>chrome.runtime.sendMessage(msg);
function render(state){
  status.textContent=state.running&&state.title?`${state.status}\n标签页：${state.title}`:state.status;
  connectBtn.disabled=state.running;stopBtn.disabled=!state.running&&!state.service;select.disabled=state.running;
  if(state.running&&state.target)select.value=String(state.target);
}
async function refresh(){
  const [tabs,[current]]=await Promise.all([chrome.tabs.query({url:'https://chatgpt.com/*'}),chrome.tabs.query({active:true,currentWindow:true})]);
  select.replaceChildren();
  for(const tab of tabs){const option=document.createElement('option');option.value=String(tab.id);option.textContent=(tab.id===current?.id?'【当前】':'')+(tab.title||tab.url);select.append(option);}
  if(current&&tabs.some(t=>t.id===current.id))select.value=String(current.id);
  if(!tabs.length)status.textContent='请先打开并登录 https://chatgpt.com/';
}
connectBtn.addEventListener('click',()=>{const tabId=Number(select.value);void send({type:'connect',tabId,title:select.selectedOptions[0]?.textContent.replace(/^【当前】/,'')}).then(render);});
stopBtn.addEventListener('click',()=>void send({type:'stop'}).then(render));
document.querySelector('#diagnose').addEventListener('click',async()=>{
  const r=await send({type:'diagnose',tabId:Number(select.value)});
  status.textContent=r.ok?'页面诊断（不发送、不读取提示词）：\n'+JSON.stringify(r.result,null,2):r.error;
});
chrome.runtime.onMessage.addListener(msg=>{if(msg?.type==='state')render(msg.state);});
await refresh();
render(await send({type:'getState'}));
