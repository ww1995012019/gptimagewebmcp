// Self-contained: Chrome serializes this function into the selected tab's isolated world.
export async function pageAction(action, payload = {}) {
  try {
  if(location.origin!=='https://chatgpt.com')throw new Error('TAB_CHANGED: selected tab must be ChatGPT');
  const assistant=[...document.querySelectorAll('[data-message-author-role="assistant"]')];
  const visible=el=>Boolean(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none');
  // The stop button does not always carry data-testid, so also match its localized label (e.g. "停止", "停止流式传输", "Stop streaming").
  const stop=document.querySelector('button[data-testid="stop-button"]')||[...document.querySelectorAll('button')].find(el=>visible(el)&&/^(停止|stop)/i.test((el.getAttribute('aria-label')||el.getAttribute('title')||'').trim()))||null;
  const enabled=el=>Boolean(el&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('[inert]'));
  const sendSelector='button[data-testid="send-button"],button[data-testid="composer-submit-button"],button#composer-submit-button';
  const isSend=el=>el.matches(sendSelector)||/^(send(?: prompt| message)?|submit|发送(?:消息|提示|提示词)?|傳送(?:訊息|提示)?|提交(?:提示词)?)$/i.test((el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim());
  // Prefer the editor's own form. Never search unrelated page buttons by partial text.
  const findComposer=el=>{
    const form=el?.closest('form')||el?.closest('[data-type="unified-composer"]');if(form)return form;
    let parent=el?.parentElement;
    for(let depth=0;parent&&parent!==document.body&&depth<6;depth++,parent=parent.parentElement){if([...parent.querySelectorAll('button')].some(isSend))return parent;}
    return null;
  };
  const editable=el=>el instanceof HTMLTextAreaElement||el.isContentEditable;
  const normalize=el=>editable(el)?el:el.querySelector('textarea,[contenteditable="true"],[contenteditable=""]');
  const known=[...new Set([...document.querySelectorAll('#prompt-textarea,[data-testid="prompt-textarea"],.ProseMirror[contenteditable="true"]')].map(normalize).filter(el=>el&&editable(el)&&visible(el)))];
  const fallback=[...document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""]')].filter(el=>{
    const scope=findComposer(el);return visible(el)&&editable(el)&&scope&&[...scope.querySelectorAll('button')].some(isSend);
  });
  const editors=known.length?known:fallback;
  const editor=editors.length===1?editors[0]:null;
  const composer=findComposer(editor);
  const candidates=composer?[...composer.querySelectorAll('button')].filter(isSend):[];
  const sends=candidates.filter(visible);const send=sends.length===1?sends[0]:null;
  const sendState=()=>{
    const uploading=Boolean(payload.hasInput&&composer&&[...composer.querySelectorAll('[role="progressbar"],[aria-busy="true"]')].some(visible));
    const reason=editors.length>1?'EDITOR_AMBIGUOUS':!editor?'EDITOR_MISSING':!composer?'COMPOSER_MISSING':sends.length>1?'SEND_AMBIGUOUS':stop?'CHAT_BUSY':!send?'SEND_BUTTON_MISSING':!enabled(send)?'SEND_DISABLED':uploading?'UPLOAD_PENDING':'READY';
    return {version:'1.4.2',ready:reason==='READY',reason,editor_present:Boolean(editor),draft_present:Boolean((editor?.value||editor?.innerText||'').trim()),page:{ready_state:document.readyState,route:location.pathname==='/'?'home':location.pathname.startsWith('/c/')?'conversation':/auth|login/.test(location.pathname)?'auth':'other',iframe_count:document.querySelectorAll('iframe').length},editables:[...document.querySelectorAll('textarea,[contenteditable],[role="textbox"]')].slice(0,12).map(el=>({tag:el.tagName,id:el.id.slice(0,80),role:el.getAttribute('role'),editable:editable(el),visible:visible(el)})),candidates:candidates.map(el=>({testid:el.getAttribute('data-testid'),id:el.id,label:el.getAttribute('aria-label'),enabled:enabled(el),visible:visible(el)})),
      // When no send button matched, list the buttons around the editor so the selector can be fixed from one report.
      nearby_buttons:send?undefined:[...((editor?.closest('form')||editor?.parentElement?.parentElement?.parentElement?.parentElement)?.querySelectorAll('button')||[])].filter(visible).slice(0,10).map(el=>({testid:el.getAttribute('data-testid'),id:el.id,label:(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim().slice(0,40),enabled:enabled(el)}))};
  };
  if(action==='context')return {url:location.href};
  if(action==='prepare'){
    if(!editor)throw new Error(`EDITOR_UNAVAILABLE: ${JSON.stringify(sendState())}`);
    if(stop)throw new Error('CHAT_BUSY: wait for current response');
    const draft=(editor.value||editor.innerText||'').trim();
    if(draft){
      // A draft that starts with gptpic's own lead text is a leftover from an earlier failed job: clear it.
      // Anything else was typed by the user and is never touched.
      if(!/^请(生成图片并返回图片|编辑我上传的图片|编辑第一张图片|参考我上传的|生成或编辑图片)/.test(draft))throw new Error(`DRAFT_EXISTS: ChatGPT 输入框里有内容（“${draft.slice(0,30)}${draft.length>30?'…':''}”），请清空或发送后重试`);
      editor.focus();
      if(editor instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,'');editor.dispatchEvent(new Event('input',{bubbles:true}));}
      else{document.execCommand('selectAll');document.execCommand('delete');}
      await new Promise(resolve=>setTimeout(resolve,150));
      if((editor.value||editor.innerText||'').trim())throw new Error('DRAFT_EXISTS: 无法清空上次残留的提示词，请手动清空 ChatGPT 输入框后重试');
    }
    const baseline={images:[...(document.querySelector('main')||document).querySelectorAll('img')].map(i=>i.currentSrc||i.src),count:assistant.length};
    // files: [{name,data}] (edit input and/or reference images); input: legacy single edit image.
    const uploads=payload.files||(payload.input?[{name:'mcp-input.png',data:payload.input}]:[]);
    if(uploads.length){
      const input=document.querySelector('input[type="file"]');
      if(!input)throw new Error('UPLOAD_UI_CHANGED: open attachment menu to expose file input');
      if(input.files?.length)throw new Error('ATTACHMENT_EXISTS: remove previous attachments yourself');
      const toFile=f=>{const binary=atob(f.data);return new File([Uint8Array.from(binary,c=>c.charCodeAt(0))],f.name,{type:'image/png'});};
      const attach=list=>{const transfer=new DataTransfer();for(const f of list)transfer.items.add(toFile(f));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
      // A single-file input only takes one file per change event, so attach several one at a time.
      if(input.multiple||uploads.length===1)attach(uploads);
      else for(const f of uploads){attach([f]);await new Promise(resolve=>setTimeout(resolve,800));}
    }
    // ProseMirror turns "\n" into separate <p> blocks, so innerText gains extra newlines; compare with whitespace collapsed.
    const flat=s=>String(s||'').replace(/\s+/g,' ').trim();
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    // Re-query: the editor can be re-mounted, and a stale node may still show text the app has discarded.
    const current=()=>[...document.querySelectorAll('#prompt-textarea,[data-testid="prompt-textarea"],.ProseMirror[contenteditable="true"],[role="textbox"][contenteditable="true"],textarea')].map(normalize).find(el=>el&&editable(el)&&visible(el))||editor;
    const has=()=>{const el=current();return flat(el.value||el.innerText).includes(flat(payload.text));};
    editor.focus();
    if(editor instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,payload.text);editor.dispatchEvent(new Event('input',{bubbles:true}));}
    else{
      // Rich editors keep their own document model and can revert DOM text they did not see typed. A paste event
      // goes through the editor's own handler, so try it first and fall back to insertText.
      const sel=getSelection();sel.selectAllChildren(editor);sel.collapseToEnd();
      const clip=new DataTransfer();clip.setData('text/plain',payload.text);
      editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clip,bubbles:true,cancelable:true}));
      await sleep(300);
      if(!has()){current().focus();document.execCommand('insertText',false,payload.text);}
    }
    await sleep(150);
    if(!has())throw new Error('EDITOR_CHANGED: prompt was not inserted; inspect draft manually');
    // Make sure the editor kept the text instead of reverting it a moment later.
    await sleep(800);
    if(!has())throw new Error(`EDITOR_REJECTED_INPUT: ChatGPT 输入框清掉了填入的提示词。页面诊断：${JSON.stringify(sendState())}`);
    return baseline;
  }
  if(action==='ready')return sendState();
  if(action==='submit'){
    const state=sendState();
    if(!state.ready)throw new Error(`SEND_NOT_READY: ${state.reason}; prompt remains a draft`);send.click();return {submitted:true};
  }
  if(action==='poll'){
    const fresh=assistant.slice(payload.baseline.count);
    if(fresh.some(m=>/you.ve reached.*limit|too many requests|达到.*上限|请求过于频繁/i.test(m.innerText)))throw new Error('RATE_LIMITED: retry later manually');
    if(stop)return {waiting:true};
    // Generated images render outside the assistant message node (e.g. <img alt="已生成图像 1" src="blob:...">), so also scan <main>.
    // Alt text is localized, so besides known alt/class hints accept any new large image that is not in a user message.
    const generated=i=>/已生成图像|generated image/i.test(i.alt||'')||i.classList.contains('image-transparency-backdrop')||(i.naturalWidth>=512&&i.naturalHeight>=512&&!i.closest('[data-message-author-role="user"]'));
    const pool=[...fresh.flatMap(m=>[...m.querySelectorAll('img')]),...[...(document.querySelector('main')||document).querySelectorAll('img')].filter(generated)];
    const fresh_=()=>[...new Set(pool)].filter(i=>i.isConnected&&i.complete&&i.naturalWidth>=128&&i.naturalHeight>=128&&!payload.baseline.images.includes(i.currentSrc||i.src));
    const first=fresh_().at(-1);if(!first)return {waiting:true};
    // Image generation renders progressively; only take the image once its source has stopped changing.
    const firstSrc=first.currentSrc||first.src;
    await new Promise(resolve=>setTimeout(resolve,1500));
    const img=fresh_().at(-1);
    if(!img||img!==first||(img.currentSrc||img.src)!==firstSrc||document.querySelector('button[data-testid="stop-button"]'))return {waiting:true};
    const url=img.currentSrc||img.src;const parsed=new URL(url,location.href);
    if(!['https:','blob:','data:'].includes(parsed.protocol))throw new Error('IMAGE_URL_INVALID');
    if(parsed.protocol==='https:'&&parsed.hostname!=='chatgpt.com'&&!parsed.hostname.endsWith('.oaiusercontent.com')&&parsed.hostname!=='oaiusercontent.com')throw new Error('IMAGE_HOST_UNSUPPORTED: visible image host requires review');
    const response=await fetch(url,{credentials:'include',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('IMAGE_FETCH_FAILED: visible image resource is inaccessible');
    const reader=response.body?.getReader();if(!reader)throw new Error('IMAGE_BODY_EMPTY');
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>25*1024*1024){await reader.cancel();throw new Error('IMAGE_TOO_LARGE');}chunks.push(value);}
    const blob=new Blob(chunks,{type:response.headers.get('content-type')||'image/png'});
    const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result).split(',')[1]);fr.onerror=()=>reject(new Error('IMAGE_READ_FAILED'));fr.readAsDataURL(blob);});
    return {data};
  }
  throw new Error('UNKNOWN_ACTION');
  } catch(error) {
    // Chrome may return a null result for a rejected injected Promise. Return errors as JSON.
    return {__image_mcp_error:error instanceof Error?error.message:String(error)};
  }
}
