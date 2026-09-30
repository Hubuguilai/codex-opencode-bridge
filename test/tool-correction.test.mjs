import {test} from 'node:test';import assert from 'node:assert/strict';
import {generateWithCorrection} from '../src/tool-correction.mjs';
import {BridgeError} from '../src/errors.mjs';
const request={mode:'native-tools',prompt:'History: client declined write'};
const callbacks={signal:new AbortController().signal,onDelta:async()=>{}};
test('One internal-tool correction preserves client denial history and never exceeds two generations',async()=>{
 let attempts=0;const backend={generate:async req=>{attempts++;assert.match(req.prompt,/client declined write/);if(attempts===2)assert.match(req.prompt,/never retry or circumvent/);throw new BridgeError(422,'internal_tool_blocked','blocked');}};
 await assert.rejects(generateWithCorrection(backend,request,callbacks),{code:'internal_tool_blocked'});assert.equal(attempts,2);
});
test('Provider denial, quota, timeout and partial streams are never automatically retried',async()=>{
 for(const code of ['upstream_access_or_quota','request_cancelled','generation_failed']){
  let attempts=0;await assert.rejects(generateWithCorrection({generate:async()=>{attempts++;throw new BridgeError(403,code,'failed');}},request,callbacks));assert.equal(attempts,1);
 }
 let attempts=0;await assert.rejects(generateWithCorrection({generate:async(req,cb)=>{attempts++;await cb.onDelta('already streamed');throw new BridgeError(422,'internal_tool_blocked','blocked');}},request,callbacks));assert.equal(attempts,1);
});
