import { chromium, type BrowserContext } from 'playwright';
import { settings } from '../config.js';
import sharp from 'sharp';
import type { ImageProvider, ImageRequest } from './types.js';
export class BrowserProvider implements ImageProvider {
  private context?:BrowserContext;
  constructor(private readonly options = {url:'https://chatgpt.com/',profile:settings.profile,headless:false}) {}
  async generate(r:ImageRequest):Promise<Buffer> {
    if (!settings.enabled) throw new Error('GENERATION_DISABLED: set IMAGE_ALLOW_BROWSER_GENERATION=true after reviewing README');
    this.context ??= await chromium.launchPersistentContext(this.options.profile,{channel:settings.channel,headless:this.options.headless,acceptDownloads:true,timeout:30000});
    const page = await this.context.newPage();
    const timer = setTimeout(()=>{void page.close().catch(()=>{});},settings.timeout);
    try {
      page.setDefaultTimeout(15000);
      await page.goto(this.options.url,{waitUntil:'domcontentloaded',timeout:30000});
      const editor = page.locator(settings.prompt);
      try { await editor.waitFor({state:'visible'}); } catch { throw new Error('LOGIN_OR_UI_REQUIRED: run npm run login; complete login/captcha manually, or update selectors'); }
      const uploads=[...(r.input?[r.input]:[]),...(r.references||[])];
      if(uploads.length) {
        const upload=page.locator('input[type="file"]');
        if(!await upload.count()) throw new Error('UPLOAD_UI_CHANGED: no file upload input; adapt browser.ts');
        await upload.first().setInputFiles(await Promise.all(uploads.map(async(b,i)=>({name:i===0&&r.input?'input.png':`reference-${i+1}.png`,mimeType:'image/png',buffer:await sharp(b).png().toBuffer()}))));
      }
      await editor.fill(`Create or edit an image as requested. Return the generated image. Requested size: ${r.size}; quality: ${r.quality}; background: ${r.background}. These are visual preferences.\n${r.prompt}`);
      await page.locator(settings.send).click();
      // Never resend a prompt: retrying submission can consume quota twice.
      const deadline = Date.now()+settings.timeout;
      while(Date.now()<deadline && !page.isClosed()) {
        const body=await page.locator('body').innerText();
        if(/you.ve reached.*limit|too many requests|达到.*上限|请求过于频繁/i.test(body)) throw new Error('RATE_LIMITED: ChatGPT quota/rate limit; retry later manually. No automatic resubmission.');
        const images=page.locator(settings.result);
        if(await images.count()) {
          const img=images.last(); await img.hover();
          const message=img.locator('xpath=ancestor::*[@data-message-author-role="assistant"]');
          const button=message.locator(settings.download);
          if(await button.count()) {
            const pending=page.waitForEvent('download',{timeout:30000}); await button.last().click();
            const download=await pending; const stream=await download.createReadStream();
            if(!stream) throw new Error('DOWNLOAD_FAILED');
            const chunks:Buffer[]=[]; let bytes=0;
            for await(const chunk of stream){bytes+=chunk.length;if(bytes>25*1024*1024){await download.cancel();throw new Error('DOWNLOAD_TOO_LARGE');} chunks.push(Buffer.from(chunk));}
            return Buffer.concat(chunks);
          }
        }
        await page.waitForTimeout(1000);
      }
      throw new Error('TIMEOUT: generation may already have consumed quota; inspect browser before retrying');
    } catch(e) { if(page.isClosed()) throw new Error('TIMEOUT_OR_BROWSER_CLOSED: inspect ChatGPT before retrying'); throw e; }
    finally {clearTimeout(timer);await page.close().catch(()=>{});}
  }
  async close(){await this.context?.close();this.context=undefined;}
}
