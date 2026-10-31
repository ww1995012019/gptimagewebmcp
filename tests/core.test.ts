import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SafeFiles } from '../src/files.js';
import { imageSchema } from '../src/server.js';
import { MockProvider } from '../src/providers/mock.js';
test('schema validates required prompt, limits, defaults and enum',()=>{
  assert.equal(imageSchema.parse({prompt:'image',output_path:'a.png'}).overwrite,false);
  for(const data of [{prompt:'',output_path:'a.png'},{prompt:'a',output_path:'a.png',size:'2x2'},{prompt:'a',output_path:'a.png',quality:'invalid'}])assert.equal(imageSchema.safeParse(data).success,false);
});
test('path confinement, traversal, overwrite, image metadata and junction rejection',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'image-mcp-'));const safe=new SafeFiles([root]);
  try{
    await assert.rejects(safe.check(path.join(root,'..','escape.png')),/PATH_DENIED/);
    await assert.rejects(safe.check(path.join(root,'file.png:stream')),/PATH_DENIED/);
    const data=await new MockProvider().generate({prompt:'x',size:'1024x1024',quality:'auto',background:'transparent'});
    const target=path.join(root,'sub','a.png');const saved=await safe.save(target,data);assert.equal(saved.width,1024);assert.ok(saved.bytes>0);
    await assert.rejects(safe.save(target,data),/EEXIST/);await safe.save(target,data,true);
    await assert.rejects(safe.save(path.join(root,'bad.jpg'),data),/FORMAT_INVALID/);
    const outside=await fs.mkdtemp(path.join(os.tmpdir(),'image-out-'));
    try{await fs.symlink(outside,path.join(root,'linked'),'junction');await assert.rejects(safe.check(path.join(root,'linked','x.png')),/PATH_DENIED/);}finally{await fs.rm(outside,{recursive:true,force:true});}
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
