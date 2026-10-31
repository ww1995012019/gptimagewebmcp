import {initializeBridge} from './auth.js';
import path from 'node:path';
import {createBridge} from './http.js';
import {settings} from '../config.js';
const server=createBridge(await initializeBridge(),settings.timeout,undefined,path.join(settings.output,'late'));
server.on('error',e=>{console.error(`Bridge failed: ${e.message}`);process.exitCode=1;});
server.listen(43127,'127.0.0.1',()=>console.error('图片浏览器桥已启动：http://127.0.0.1:43127。请在默认 Chrome 加载 extension 目录，打开扩展连接页并选择 ChatGPT 标签。保持此终端和连接页打开。'));
process.on('SIGINT',()=>{server.closeAllConnections();server.close();});
