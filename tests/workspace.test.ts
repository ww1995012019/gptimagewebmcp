import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {settings,project,detectWorkspace} from '../src/config.js';
import {createServer,imageSchema} from '../src/server.js';
import {MockProvider} from '../src/providers/mock.js';
test('workspace detection ignores broad or unrelated folders',()=>{
 assert.equal(detectWorkspace(path.parse(process.cwd()).root),undefined);
 assert.equal(detectWorkspace(os.homedir()),undefined);
 assert.equal(detectWorkspace(project),undefined);
 assert.equal(detectWorkspace(path.join(project,'extension')),undefined);
 if(process.env.SystemRoot)assert.equal(detectWorkspace(path.join(process.env.SystemRoot,'System32')),undefined);
 const dir=path.join(os.tmpdir(),'some-project');assert.equal(detectWorkspace(dir,path.join(os.tmpdir(),'explicit')),path.join(os.tmpdir(),'explicit'));
});
test('relative output, input and read paths resolve inside the workspace; outside stays denied',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'image-ws-'));const output=await fs.mkdtemp(path.join(os.tmpdir(),'image-out-'));
 const prev=settings.output;settings.output=output;
 const app=createServer(new MockProvider(),workspace);
 try{
  const saved=await app.generate(imageSchema.parse({prompt:'x',output_path:'assets/item.png'}));
  assert.equal(saved.absolute_path,path.join(workspace,'assets','item.png'));
  assert.equal(saved.relative_path,path.join('assets','item.png'));
  await fs.access(path.join(workspace,'assets','item.png'));
  // Absolute path inside the workspace works too, and so does the shared output folder.
  await app.generate(imageSchema.parse({prompt:'x',output_path:path.join(workspace,'abs.png')}));
  await app.generate(imageSchema.parse({prompt:'x',output_path:path.join(output,'shared.png')}));
  const edited=await app.generate(imageSchema.parse({prompt:'x',output_path:'assets/item-2.png'}),'assets/item.png');
  assert.equal(edited.absolute_path,path.join(workspace,'assets','item-2.png'));
  await assert.rejects(app.generate(imageSchema.parse({prompt:'x',output_path:path.join(os.tmpdir(),'elsewhere.png')})),/PATH_DENIED: .*allowed folders/);
  // generate_assets without output_dir keeps using the output folder.
  const batch=await app.batch({prompts:['a'],background:'auto'});
  assert.ok(String((batch.results[0] as {absolute_path:string}).absolute_path).startsWith(output));
 }finally{settings.output=prev;await app.close();await fs.rm(workspace,{recursive:true,force:true});await fs.rm(output,{recursive:true,force:true});}
});
