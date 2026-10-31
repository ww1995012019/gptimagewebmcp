import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { BrowserProvider } from '../src/providers/browser.js';
import { settings } from '../src/config.js';
test('real Chromium against local fixture: upload, prompt, result discovery, download',async()=>{
 const png=await sharp({create:{width:8,height:8,channels:4,background:'red'}}).png().toBuffer();
 const http=createServer((req,res)=>{
  if(req.url==='/download'){res.writeHead(200,{'Content-Type':'image/png','Content-Disposition':'attachment; filename="image.png"'});res.end(png);return;}
  res.setHeader('Content-Type','text/html');
  res.end(`<input type="file"><div id="prompt-textarea" style="min-height:40px" contenteditable="true"></div><button data-testid="send-button" onclick="document.querySelector('article').hidden=false">Send</button><article hidden data-message-author-role="assistant"><img src="data:image/png;base64,${png.toString('base64')}"><button aria-label="Download" onclick="location.href='/download'">Download</button></article>`);
 });
 await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'image-browser-'));const previous=settings.enabled;settings.enabled=true;settings.channel=process.env.IMAGE_BROWSER_CHANNEL;
 const provider=new BrowserProvider({url:`http://127.0.0.1:${(http.address() as {port:number}).port}`,profile,headless:true});
 try{const data=await provider.generate({prompt:'edit',size:'1024x1024',quality:'auto',background:'auto',input:png});assert.equal((await sharp(data).metadata()).width,8);}
 finally{settings.enabled=previous;await provider.close();http.close();await fs.rm(profile,{recursive:true,force:true});}
});
