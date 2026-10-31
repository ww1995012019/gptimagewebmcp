import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {project} from '../config.js';
export async function readToken(){
  const token=(await fs.readFile(path.join(project,'.bridge-token'),'utf8').catch(()=>{throw new Error('BRIDGE_NOT_CONFIGURED: 在 Chrome 点扩展图标 → 启动（会自动生成令牌）');})).trim();
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid .bridge-token');
  return token;
}
export async function initializeBridge(){
  const file=path.join(project,'.bridge-token');
  try{await fs.writeFile(file,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  const token=await readToken();
  await fs.writeFile(path.join(project,'extension','connection.json'),JSON.stringify({url:'http://127.0.0.1:43127',token}),{mode:0o600});
  return token;
}
