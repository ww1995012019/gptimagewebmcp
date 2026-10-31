import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
const app=createServer();
process.on('SIGINT',()=>{void app.close().finally(()=>process.exit(0));});
process.on('SIGTERM',()=>{void app.close().finally(()=>process.exit(0));});
process.stdin.on('end',()=>{void app.close();});
serveStdio(()=>app.server);
