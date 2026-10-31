import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {settings} from '../src/config.js';
import {createServer,imageSchema} from '../src/server.js';
import {MockProvider} from '../src/providers/mock.js';
import {BrowserProvider} from '../src/providers/browser.js';
test('provider errors, partial batch failure and no duplicate retry',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'image-errors-'));const prev=settings.output;settings.output=root;
 let calls=0;const mock=new MockProvider();
 const app=createServer({async generate(r){calls++;if(r.prompt==='bad')throw new Error('RATE_LIMITED: retry later');return mock.generate(r);},async close(){}});
 try{
  const batch=await app.batch({prompts:['one','bad','three'],background:'auto'});
  assert.equal(calls,3);assert.ok('absolute_path' in batch.results[0]);assert.match(String(batch.results[1].error),/RATE_LIMITED/);assert.ok('absolute_path' in batch.results[2]);
  await assert.rejects(app.generate(imageSchema.parse({prompt:'bad',output_path:'bad.png'})),/RATE_LIMITED/);assert.equal(calls,4);
  const enabled=settings.enabled;settings.enabled=false;
  try{await assert.rejects(new BrowserProvider().generate({prompt:'x',size:'1024x1024',quality:'auto',background:'auto'}),/GENERATION_DISABLED/);}finally{settings.enabled=enabled;}
 }finally{settings.output=prev;await app.close();await fs.rm(root,{recursive:true,force:true});}
});
