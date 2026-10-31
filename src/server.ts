import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { settings } from './config.js';
import { SafeFiles } from './files.js';
import { MockProvider } from './providers/mock.js';
import { BrowserProvider } from './providers/browser.js';
import { ExtensionProvider } from './providers/extension.js';
import type { ImageProvider } from './providers/types.js';
// Up to 4 local images uploaded alongside the prompt so new images keep their style, palette or characters.
const referencePaths=z.array(z.string().min(1)).min(1).max(4).optional().describe('Optional 1-4 local reference images (style, palette, character) uploaded with the prompt; the new image follows them instead of editing them.');
export const imageSchema = z.object({prompt:z.string().trim().min(1).max(12000),reference_paths:referencePaths,size:z.enum(['1024x1024','1536x1024','1024x1536']).default('1024x1024'),quality:z.enum(['auto','low','medium','high']).default('auto'),background:z.enum(['auto','transparent','opaque']).default('auto'),output_path:z.string().min(1),model:z.string().optional(),overwrite:z.boolean().default(false)});
const editSchema=imageSchema.extend({input_path:z.string().min(1)});
const batchSchema=z.object({prompts:z.array(z.string().trim().min(1).max(12000)).min(1).max(3),output_dir:z.string().optional(),background:z.enum(['auto','transparent','opaque']).default('auto'),reference_paths:referencePaths});
export function createServer(provider:ImageProvider = settings.test ? new MockProvider() : settings.browserMode==='extension'?new ExtensionProvider():new BrowserProvider(), workspace:string|undefined = settings.workspace) {
  const server=new McpServer({name:'gptpic',version:'1.0.0'});
  // Relative paths resolve against the client's workspace when there is one, else the output folder.
  const base=workspace??settings.output;
  const files=new SafeFiles([...new Set([base,settings.output,...settings.allowed])]); let busy=false;
  const where=workspace?`Relative paths resolve against the workspace ${workspace}; absolute paths must be inside it, ${settings.output} or IMAGE_ALLOWED_DIRS.`:`Relative paths resolve against ${settings.output}; absolute paths must be inside it or IMAGE_ALLOWED_DIRS.`;
  const result=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
  const run=async(fn:()=>Promise<unknown>)=>{
    if(busy) return {...result({error:'BUSY: browser concurrency is limited to 1'}),isError:true};
    busy=true;try{return result(await fn());}catch(e){return {...result({error:(e as Error).message}),isError:true};}finally{busy=false;}
  };
  async function generate(a:z.infer<typeof imageSchema>,input?:string){
    if(a.model) throw new Error('MODEL_UNSUPPORTED: webpage mode cannot reliably select API model identifiers');
    const output=await files.check(path.resolve(base,a.output_path));
    if(!['.png','.webp'].includes(path.extname(output).toLowerCase())) throw new Error('FORMAT_INVALID: .png or .webp required');
    if(!a.overwrite){try{await fs.lstat(output);throw new Error('FILE_EXISTS: overwrite=false');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
    const inputData=input?await files.read(path.resolve(base,input)):undefined;
    const references=a.reference_paths?await Promise.all(a.reference_paths.map(p=>files.read(path.resolve(base,p)))):undefined;
    const data=await provider.generate({...a,input:inputData,references});
    return {...await files.save(output,data,a.overwrite),test_mode:settings.test,requested_size:a.size,warning:settings.test?'MOCK IMAGE: no AI request was sent':`Size, quality and transparency are prompt preferences. ${settings.browserMode==='extension'?'Saved visible webpage image resource; it may be a preview resolution.':'Downloaded through webpage button.'}`};
  }
  server.registerTool('generate_image',{description:'Generate and save an image using ChatGPT browser. Real mode consumes ChatGPT quota. Only call when user requests image generation. Pass reference_paths to keep a set of images consistent in style. '+where,inputSchema:imageSchema},a=>run(()=>generate(a)));
  server.registerTool('edit_image',{description:'Upload a local image and request edits. Original is preserved unless overwrite=true and output_path equals input_path. Real mode consumes ChatGPT quota. '+where,inputSchema:editSchema},a=>run(()=>generate(a,a.input_path)));
  async function batch(a:z.infer<typeof batchSchema>){
    const dir=await files.check(a.output_dir?path.resolve(base,a.output_dir):settings.output);
    const results=[];const id=crypto.randomUUID();
    for(const [i,prompt] of a.prompts.entries()) {try{results.push({index:i,...await generate(imageSchema.parse({prompt,background:a.background,reference_paths:a.reference_paths,output_path:path.join(dir,`${id}-${i+1}.png`)}))});}catch(e){results.push({index:i,error:(e as Error).message});}}
    return {results,concurrency:1};
  }
  server.registerTool('generate_assets',{description:'Generate 1-3 assets sequentially; each prompt consumes quota in real mode. Partial failures are returned separately. reference_paths apply to every prompt, which keeps the set consistent. Without output_dir images go to '+settings.output+'. '+where,inputSchema:batchSchema},a=>run(()=>batch(a)));
  server.registerTool('list_image_models',{description:'Report verified configuration and unknown webpage capabilities.',inputSchema:z.object({})},async()=>result({provider:settings.test?'mock':`chatgpt-${settings.browserMode}`,models:[],model_selection:'Unavailable: follows ChatGPT account/UI',sizes:'Unknown; size input is a prompt preference',transparency:'Unknown; requested through prompt',formats:['png','webp'],format_note:'Local conversion of webpage image',max_batch:3,concurrency:1,test_mode:settings.test,workspace:workspace??null,relative_paths_resolve_against:base,allowed_roots:[...new Set([base,settings.output,...settings.allowed])]}));
  server.registerTool('read_image',{description:'Read a saved image inside authorized roots for visual inspection. '+where,inputSchema:z.object({path:z.string().min(1)})},async a=>{
    try{const data=await files.read(path.resolve(base,a.path));const preview=await sharp(data).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();return {content:[{type:'image' as const,data:preview.toString('base64'),mimeType:'image/png'}]};}catch(e){return {...result({error:(e as Error).message}),isError:true};}
  });
  return {server,generate,batch,close:()=>provider.close()};
}
