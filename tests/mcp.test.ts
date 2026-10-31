import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
test('actual stdio discovery, generate, edit, read, batch partial failure and errors',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mcp-stdio-'));
 const client=new Client({name:'test-client',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js')],env:{...process.env as Record<string,string>,IMAGE_TEST_MODE:'true',IMAGE_OUTPUT_DIR:root}});
 try{
  await client.connect(transport);const listed=await client.listTools();assert.equal(listed.tools.length,5);
  const call=async(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args});
  const generated=await call('generate_image',{prompt:'test',output_path:'a.png'});assert.ok(!generated.isError);
  assert.equal((await call('generate_image',{prompt:'test',output_path:'a.png'})).isError,true);
  assert.equal((await call('generate_image',{prompt:'test',output_path:'../escape.png'})).isError,true);
  assert.equal((await call('generate_image',{prompt:'test',output_path:'b.png',model:'unknown'})).isError,true);
  assert.ok(!(await call('edit_image',{prompt:'blue',input_path:'a.png',output_path:'edited.webp'})).isError);
  assert.ok(!(await call('generate_image',{prompt:'same style',reference_paths:['a.png','edited.webp'],output_path:'styled.png'})).isError);
  assert.equal((await call('generate_image',{prompt:'x',reference_paths:['a.png','a.png','a.png','a.png','a.png'],output_path:'too-many.png'})).isError,true);
  assert.equal((await call('generate_image',{prompt:'x',reference_paths:['missing.png'],output_path:'missing-ref.png'})).isError,true);
  const read=await call('read_image',{path:'edited.webp'});assert.equal((read.content as {type:string}[])[0].type,'image');
  const batch=await call('generate_assets',{prompts:['one','two','three']});assert.ok(!batch.isError);
  const json=JSON.parse((batch.content as {text:string}[])[0].text);assert.equal(json.results.length,3);
  assert.equal((await call('generate_assets',{prompts:['1','2','3','4']})).isError,true);
  assert.equal((await call('generate_image',{prompt:'',output_path:'b.png'})).isError,true);
  assert.ok(!(await call('list_image_models',{})).isError);
 } finally{await client.close();await fs.rm(root,{recursive:true,force:true});}
});
