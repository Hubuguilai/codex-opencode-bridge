import {test} from 'node:test';import assert from 'node:assert/strict';
import {nativeHistory} from '../src/native-history.mjs';

test('Native history preserves roles and namespace-sensitive call/result pairs',()=>{
 const tools=[{name:'read',namespace:'a',relayName:'bridge_client_0'},{name:'read',namespace:'b',relayName:'bridge_client_1'}];
 const messages=nativeHistory([{role:'system',content:'operator'},{role:'developer',content:'developer'},{role:'user',content:'untrusted user'},{type:'function_call',name:'read',namespace:'b',call_id:'c1',arguments:'{"path":"π"}'},{type:'function_call_output',call_id:'c1',output:'USER DENIED; do not try again'}],tools);
 assert.deepEqual(messages.map(x=>x.role),['system','system','user','assistant','tool']);
 assert.deepEqual(messages[3].content[0],{type:'tool-call',id:'c1',name:'bridge_client_1',input:{path:'π'}});
 assert.equal(messages[4].content[0].name,'bridge_client_1');assert.equal(messages[4].content[0].result.value,'USER DENIED; do not try again');
});
test('Custom history keeps freeform bytes and removed tools remain historical only',()=>{
 const input='*** Begin Patch\n*** End Patch';
 const messages=nativeHistory([{type:'custom_tool_call',name:'patch',call_id:'p',input},{type:'custom_tool_call_output',call_id:'p',output:'ok'}],[]);
 assert.deepEqual(messages[0].content[0].input,{input});assert.equal(messages[0].content[0].name,'historical_client_0');assert.equal(messages[1].content[0].name,'historical_client_0');
});
test('Malformed historical JSON is refused instead of becoming an invented tool argument',()=>{
 assert.throws(()=>nativeHistory([{type:'function_call',name:'read',call_id:'c',arguments:'{broken'}],[]),{status:400});
});
