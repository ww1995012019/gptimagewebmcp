import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,type Page} from 'playwright';
import sharp from 'sharp';
import {settings} from '../src/config.js';
// @ts-expect-error Extension is deliberately plain JavaScript loaded directly by Chrome.
import {pageAction} from '../extension/automation.js';
// @ts-expect-error Plain JavaScript shared directly with the extension.
import {readActionResult} from '../extension/results.js';
async function invokeOn(page:Page,action:string,payload?:unknown){
 const result=await page.evaluate(({action,payload,source})=>(0,eval)(`(${source})`)(action,payload),{action,payload,source:pageAction.toString()});
 return readActionResult(action,[{frameId:0,result}]);
}
test('extension DOM automation: refuses drafts, uploads, submits once, skips old images and reads new visible resource',{timeout:20000},async()=>{
 const data=await sharp({create:{width:256,height:256,channels:4,background:'green'}}).png().toBuffer();
 const browser=await chromium.launch({channel:settings.channel,headless:true});const page=await browser.newPage();page.setDefaultTimeout(5000);
 try{
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<div><input type="file"><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></div><div id="result"></div><script>document.querySelector('button').onclick=()=>{window.submits=(window.submits||0)+1;const article=document.createElement('article');article.setAttribute('data-message-author-role','assistant');const image=new Image();image.src='data:image/png;base64,${data.toString('base64')}';article.append(image);document.querySelector('#result').append(article);};</script>`}));
  await page.goto('https://chatgpt.com/');
  const invoke=(action:string,payload?:unknown)=>invokeOn(page,action,payload);
  await page.locator('textarea').fill('existing draft');
  await assert.rejects(invoke('prepare',{text:'new prompt'}),/DRAFT_EXISTS/);
  assert.equal(await page.locator('textarea').inputValue(),'existing draft');
  // A leftover prompt from an earlier gptpic job is cleared and replaced.
  await page.locator('textarea').fill('请生成图片并返回图片。期望尺寸 1024x1024\nold prompt');
  await invoke('prepare',{text:'fresh prompt'});
  assert.equal(await page.locator('textarea').inputValue(),'fresh prompt');
  await page.locator('textarea').fill('');
  const baseline=await invoke('prepare',{text:'make an image',input:data.toString('base64')});
  assert.equal(await page.locator('input').evaluate((el:HTMLInputElement)=>el.files?.length),1);
  assert.equal((await invoke('ready')).ready,true);assert.equal((await invoke('poll',{baseline})).waiting,true);
  await invoke('submit');await page.locator('img').waitFor();
  const output=await invoke('poll',{baseline});assert.ok(output.data);assert.equal((await sharp(Buffer.from(output.data,'base64')).metadata()).width,256);
  assert.equal(await page.evaluate('window.submits'),1);
 }finally{await browser.close();}
});
test('send readiness regression: composer IDs, unrelated progress, localized labels, disabled, hidden and ambiguous buttons',{timeout:20000},async()=>{
 const browser=await chromium.launch({channel:settings.channel,headless:true});const page=await browser.newPage();
 const invoke=(action:string,payload?:unknown)=>invokeOn(page,action,payload);
 try{
  await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:'<main></main>'}));await page.goto('https://chatgpt.com/');
  await page.setContent('<div role="progressbar">unrelated sidebar progress</div><form><textarea id="prompt-textarea"></textarea><button type="button" id="composer-submit-button" aria-label="Send prompt">Send</button></form>');
  assert.equal((await invoke('ready')).ready,true);
  await page.locator('button').evaluate((el:HTMLButtonElement)=>{el.disabled=true;});
  assert.equal((await invoke('ready')).reason,'SEND_DISABLED');await assert.rejects(invoke('submit'),/SEND_DISABLED/);
  await page.locator('button').evaluate((el:HTMLButtonElement)=>{el.disabled=false;el.setAttribute('aria-disabled','true');});
  assert.equal((await invoke('ready')).reason,'SEND_DISABLED');
  await page.setContent('<form><div id="prompt-textarea" contenteditable="true"></div><button type="button" aria-label="发送消息">↑</button><button style="display:none" data-testid="send-button">hidden</button></form>');
  await invoke('prepare',{text:'fixture image prompt'});assert.equal((await invoke('ready')).ready,true);
  await page.locator('form').evaluate(el=>{const bar=document.createElement('div');bar.setAttribute('role','progressbar');bar.textContent='upload';el.append(bar);});
  assert.equal((await invoke('ready',{hasInput:true})).reason,'UPLOAD_PENDING');assert.equal((await invoke('ready',{hasInput:false})).ready,true);
  await page.setContent('<form><textarea id="prompt-textarea"></textarea><button type="button" aria-label="Send message">Send</button><button type="button" data-testid="send-button">Send</button></form>');
  assert.equal((await invoke('ready')).reason,'SEND_AMBIGUOUS');await assert.rejects(invoke('submit'),/SEND_AMBIGUOUS/);
  await page.setContent('<form><textarea id="prompt-textarea"></textarea></form><button data-testid="send-button">unrelated send</button>');
  assert.equal((await invoke('ready')).reason,'SEND_BUTTON_MISSING');
  const diagnostics=JSON.stringify(await invoke('ready'));assert.ok(!diagnostics.includes('fixture image prompt'));
 }finally{await browser.close();}
});
test('editor discovery survives rerender, wrapper IDs and hidden stale editors; missing and ambiguous states are safe',{timeout:20000},async()=>{
 const browser=await chromium.launch({channel:settings.channel,headless:true});const page=await browser.newPage();
 const invoke=(action:string,payload?:unknown)=>invokeOn(page,action,payload);
 try{
  await page.route('https://chatgpt.com/**',r=>r.fulfill({contentType:'text/html',body:'<main></main>'}));await page.goto('https://chatgpt.com/');
  await page.setContent('<form><textarea id="prompt-textarea"></textarea><button type="button" id="composer-submit-button">Send</button></form>');
  await invoke('prepare',{text:'private fixture draft'});
  await page.locator('textarea').evaluate((el:HTMLTextAreaElement)=>{const replacement=document.createElement('div');replacement.contentEditable='true';replacement.className='ProseMirror';replacement.textContent=el.value;el.replaceWith(replacement);});
  const replaced=await invoke('ready');assert.equal(replaced.ready,true);assert.equal(replaced.draft_present,true);
  assert.ok(!JSON.stringify(replaced).includes('private fixture draft'));
  await page.setContent('<textarea id="prompt-textarea" style="display:none"></textarea><form><div class="ProseMirror" contenteditable="true">draft</div><button type="button" aria-label="Send prompt">↑</button></form>');
  assert.equal((await invoke('ready')).ready,true);
  await page.setContent('<form><div id="prompt-textarea"><div contenteditable="true" style="min-height:30px"></div></div><button type="button" aria-label="发送消息">↑</button></form>');
  await invoke('prepare',{text:'wrapper draft'});assert.equal((await invoke('ready')).ready,true);
  await page.setContent('<form><textarea></textarea><button type="button" aria-label="Send message">↑</button></form>');
  assert.equal((await invoke('ready')).ready,true);
  await page.setContent('<form><textarea></textarea><textarea></textarea><button type="button" aria-label="Send message">↑</button></form>');
  assert.equal((await invoke('ready')).reason,'EDITOR_AMBIGUOUS');await assert.rejects(invoke('prepare',{text:'must not be inserted'}),/EDITOR_AMBIGUOUS/);
  assert.equal(await page.locator('textarea').first().inputValue(),'');
  await page.setContent('<form><textarea aria-label="unrelated notes"></textarea><button type="button">Search</button></form>');
  const missing=await invoke('ready');assert.equal(missing.reason,'EDITOR_MISSING');assert.equal(missing.version,'1.4.2');assert.equal(missing.editables[0].tag,'TEXTAREA');
  const failed=await page.evaluate(({source})=>(0,eval)(`(${source})`)('poll',{}),{source:pageAction.toString()});
  assert.equal(typeof failed.__image_mcp_error,'string');
  assert.throws(()=>readActionResult('poll',[{frameId:0,result:failed}]),/PAGE_ACTION_FAILED \[poll\]/);
 }finally{await browser.close();}
});
test('extension uploads several images: one change per file on single inputs, all at once on multiple inputs',{timeout:20000},async()=>{
 const data=(await sharp({create:{width:64,height:64,channels:4,background:'red'}}).png().toBuffer()).toString('base64');
 const browser=await chromium.launch({channel:settings.channel,headless:true});
 try{
  for(const multiple of [false,true]){
   const page=await browser.newPage();page.setDefaultTimeout(5000);
   await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<div><input type="file"${multiple?' multiple':''}><textarea id="prompt-textarea"></textarea><button data-testid="send-button">Send</button></div><script>window.names=[];document.querySelector('input').addEventListener('change',e=>{window.names.push([...e.target.files].map(f=>f.name).join('+'));});</script>`}));
   await page.goto('https://chatgpt.com/');
   await invokeOn(page,'prepare',{text:'make an image',files:[{name:'reference-1.png',data},{name:'reference-2.png',data}]});
   assert.deepEqual(await page.evaluate('window.names'),multiple?['reference-1.png+reference-2.png']:['reference-1.png','reference-2.png']);
   await page.close();
  }
 }finally{await browser.close();}
});
test('extension inserts the prompt through paste for editors that revert untyped DOM text, and reports editors that reject it',{timeout:20000},async()=>{
 const browser=await chromium.launch({channel:settings.channel,headless:true});
 try{
  for(const acceptPaste of [true,false]){
   const page=await browser.newPage();page.setDefaultTimeout(5000);
   // Mock rich editor: keeps its own model, accepts text only from its paste handler, and re-renders from the model after any other input.
   await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<form><div class="ProseMirror" contenteditable="true" role="textbox"></div><button type="button" data-testid="send-button">Send</button></form><script>
    const ed=document.querySelector('[role=textbox]');let model='';
    ed.addEventListener('paste',e=>{if(!${acceptPaste})return;e.preventDefault();model+=e.clipboardData.getData('text/plain');ed.textContent=model;});
    ed.addEventListener('input',()=>setTimeout(()=>{ed.textContent=model;},200));
   </script>`}));
   await page.goto('https://chatgpt.com/');
   if(acceptPaste){await invokeOn(page,'prepare',{text:'paste me'});assert.equal(await page.locator('[role=textbox]').textContent(),'paste me');}
   else await assert.rejects(invokeOn(page,'prepare',{text:'paste me'}),/EDITOR_REJECTED_INPUT/);
   await page.close();
  }
 }finally{await browser.close();}
});
