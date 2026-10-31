import { chromium } from 'playwright';
import { settings } from './config.js';
const context = await chromium.launchPersistentContext(settings.profile,{channel:settings.channel,headless:false});
const page=context.pages()[0] || await context.newPage();
await page.goto('https://chatgpt.com/');
console.error('请手动登录并完成验证码。完成后关闭浏览器窗口。不要同时运行 MCP。');
await new Promise<void>(resolve=>context.on('close',()=>resolve()));
