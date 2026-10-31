export function readActionResult(action, frames) {
  const frame=Array.isArray(frames)?frames.find(f=>f?.frameId===0)||(frames.length===1?frames[0]:null):null;
  const value=frame?.result;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`PAGE_RESULT_MISSING [${action}]: 页面脚本未返回结果，可能被导航或刷新打断。不要重新提交已发送的生图请求。`);
  if(typeof value.__image_mcp_error==='string')throw new Error(`PAGE_ACTION_FAILED [${action}]: ${value.__image_mcp_error}`);
  const valid=action==='context'?typeof value.url==='string':action==='prepare'?Array.isArray(value.images)&&Number.isInteger(value.count)&&value.count>=0:action==='ready'?typeof value.ready==='boolean'&&typeof value.reason==='string':action==='submit'?value.submitted===true:action==='poll'?(typeof value.data==='string'&&value.data.length>0)||value.waiting===true:false;
  if(!valid)throw new Error(`PAGE_RESULT_INVALID [${action}]: 页面返回格式不完整。不要重新提交已发送的生图请求。`);
  return value;
}
