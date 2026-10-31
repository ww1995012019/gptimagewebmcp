import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Plain JavaScript shared with Chrome.
import {readActionResult} from '../extension/results.js';
import {parseBridgeResult} from '../src/providers/extension.js';
test('injected null/missing/error results fail with action context instead of null.data',()=>{
 for(const frames of [null,[],[{frameId:0,result:null}],[{frameId:0}],[{frameId:1,result:null}]])assert.throws(()=>readActionResult('poll',frames),/PAGE_RESULT_MISSING \[poll\]/);
 assert.throws(()=>readActionResult('poll',[{frameId:0,result:{__image_mcp_error:'Failed to fetch'}}]),/PAGE_ACTION_FAILED \[poll\]: Failed to fetch/);
 for(const value of [{data:null},{},{waiting:false},{data:25}])assert.throws(()=>readActionResult('poll',[{frameId:0,result:value}]),/PAGE_RESULT_INVALID/);
 assert.deepEqual(readActionResult('poll',[{frameId:0,result:{waiting:true}}]),{waiting:true});
 assert.equal(readActionResult('poll',[{frameId:0,result:{data:'image'}}]).data,'image');
 assert.throws(()=>readActionResult('submit',[{frameId:0,result:{submitted:false}}]),/PAGE_RESULT_INVALID \[submit\]/);
 for(const value of [null,undefined,'invalid',{data:null},{data:15}])assert.throws(()=>parseBridgeResult(value,true),/BRIDGE_INVALID_RESPONSE/);
 assert.throws(()=>parseBridgeResult({error:'RATE_LIMITED'},false),/RATE_LIMITED/);
});
