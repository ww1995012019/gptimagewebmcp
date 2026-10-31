import sharp from 'sharp';
import {settings} from '../config.js';
import {readToken} from '../bridge/auth.js';
import type {ImageProvider,ImageRequest} from './types.js';
export function parseBridgeResult(value:unknown,ok:boolean):string {
  if(!value||typeof value!=='object')throw new Error('BRIDGE_INVALID_RESPONSE: expected an object');
  const result=value as {data?:unknown;error?:unknown};
  if(!ok||typeof result.data!=='string'||!result.data)throw new Error(typeof result.error==='string'?result.error:'BRIDGE_INVALID_RESPONSE: missing image data');
  return result.data;
}
export class ExtensionProvider implements ImageProvider {
  private controller?:AbortController;
  async generate(r:ImageRequest){
    if(!settings.enabled)throw new Error('GENERATION_DISABLED: IMAGE_ALLOW_BROWSER_GENERATION=false');
    this.controller=new AbortController();const timer=setTimeout(()=>this.controller?.abort(),settings.timeout+5000);
    try{
      // References only guide style, so shrink them to keep the upload small; the edited input keeps full size.
      const reference=async(b:Buffer)=>(await sharp(b).resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png().toBuffer()).toString('base64');
      const body={...r,input:r.input?(await sharp(r.input).png().toBuffer()).toString('base64'):undefined,references:r.references?.length?await Promise.all(r.references.map(reference)):undefined};
      const response=await fetch('http://127.0.0.1:43127/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await readToken()}`},signal:this.controller.signal,body:JSON.stringify(body)});
      const encoded=parseBridgeResult(await response.json(),response.ok);
      const data=Buffer.from(encoded,'base64');if(data.length>25*1024*1024)throw new Error('IMAGE_TOO_LARGE');
      await sharp(data).metadata();return data;
    }catch(e){if((e as Error).name==='AbortError')throw new Error('TIMEOUT: check ChatGPT before retrying');if((e as Error).message==='fetch failed')throw new Error('BRIDGE_OFFLINE: 本地服务未运行。在 Chrome 打开 ChatGPT，点扩展图标 → 启动');throw e;}
    finally{clearTimeout(timer);this.controller=undefined;}
  }
  async close(){this.controller?.abort();}
}
