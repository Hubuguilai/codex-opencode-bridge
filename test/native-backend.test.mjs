import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OpenCodeBackend} from '../src/opencode.mjs';

function fixture(t, behavior) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-native-backend-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const backend=new OpenCodeBackend({url:'http://unused',password:'test',directory,mode:'native-tools',pollMs:1});
 const routes=[];
 backend.call=async(route,options={})=>{
  routes.push([route,options.method||'GET']);
  if(route==='/api/session')return {data:{id:'ses_test'}};
  if(route.endsWith('/prompt')){
   const manifest=JSON.parse(fs.readFileSync(path.join(directory,'bridge-request.json')));
   fs.writeFileSync(path.join(directory,'bridge-plugin-ready'),manifest.requestId);
   await behavior({directory,manifest});return {};
  }
  if(route.includes('/message'))return {data:[]};
  return null;
 };
 return {backend,directory,routes};
}
const request={model:'opencode/test',prompt:'client task',tools:[{relayName:'bridge_client_0',kind:'function',name:'exec_command',namespace:'functions'}]};

test('Native backend transfers original identity and arguments then interrupts and deletes upstream',async t=>{
 const {backend,directory,routes}=fixture(t,({directory,manifest})=>fs.writeFileSync(path.join(directory,'bridge-call.json'),JSON.stringify({requestId:manifest.requestId,kind:'call',relayName:'bridge_client_0',input:{cmd:'echo π'}})));
 const result=await backend.generate(request,{signal:AbortSignal.timeout(1000),onDelta:()=>{throw new Error('No fake text');}});
 assert.equal(result.calls[0].namespace,'functions');assert.equal(result.calls[0].name,'exec_command');assert.deepEqual(JSON.parse(result.calls[0].arguments),{cmd:'echo π'});assert.equal(result.tokens,null);
 assert.deepEqual(routes.slice(-2),[['/api/session/ses_test/interrupt','POST'],['/api/session/ses_test','DELETE']]);
 assert.equal(fs.existsSync(path.join(directory,'bridge-request.json')),false);assert.equal(backend.busy,false);
});

test('Native backend rejects stale capture and cleans up instead of executing a mismatched call',async t=>{
 const {backend,routes}=fixture(t,({directory})=>fs.writeFileSync(path.join(directory,'bridge-call.json'),JSON.stringify({requestId:'old',kind:'call',relayName:'bridge_client_0',input:{cmd:'unexpected'}})));
 await assert.rejects(backend.generate(request,{signal:AbortSignal.timeout(1000),onDelta:()=>{}}),{code:'relay_state_mismatch'});
 assert.equal(routes.at(-1)[1],'DELETE');assert.equal(backend.busy,false);
});

test('Cancelled native request cleans up and a subsequent request can transfer a tool',async t=>{
 let first=true;const {backend,directory}=fixture(t,({directory,manifest})=>{if(first){first=false;return;}fs.writeFileSync(path.join(directory,'bridge-call.json'),JSON.stringify({requestId:manifest.requestId,kind:'call',relayName:'bridge_client_0',input:{cmd:'recovered'}}));});
 await assert.rejects(backend.generate(request,{signal:AbortSignal.timeout(30),onDelta:()=>{}}));
 assert.equal(fs.existsSync(path.join(directory,'bridge-request.json')),false);
 const recovered=await backend.generate(request,{signal:AbortSignal.timeout(1000),onDelta:()=>{}});
 assert.equal(JSON.parse(recovered.calls[0].arguments).cmd,'recovered');
});

test('Native backend sends text before completion and does not replay it at finish',async t=>{
 const {backend}=fixture(t,()=>{});const original=backend.call.bind(backend);
 let polls=0,release;
 const firstDelivered=new Promise(resolve=>{release=resolve;});
 backend.call=async(route,options)=>{
  if(!route.includes('/message'))return original(route,options);
  if(++polls===2)await Promise.race([firstDelivered,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Text was buffered until completion')),200))]);
  return {data:[{id:'a',type:'assistant',content:[{type:'text',text:polls===1?'Hello':'Hello world'}],time:polls===1?{}:{completed:1},finish:'stop'}]};
 };
 const deltas=[];
 await backend.generate(request,{signal:AbortSignal.timeout(1000),onDelta:async value=>{deltas.push(value);release();}});
 assert.deepEqual(deltas,['Hello',' world']);
});

test('Native tool transfer preserves preceding streamed commentary and call identity',async t=>{
 const {backend,directory}=fixture(t,()=>{});const original=backend.call.bind(backend);let polls=0;
 backend.call=async(route,options)=>{
  if(!route.includes('/message'))return original(route,options);
  if(++polls===2){const manifest=JSON.parse(fs.readFileSync(path.join(directory,'bridge-request.json')));
   fs.writeFileSync(path.join(directory,'bridge-call.json'),JSON.stringify({requestId:manifest.requestId,kind:'call',relayName:'bridge_client_0',input:{cmd:'echo hello'}}));}
  return {data:[{id:'a',type:'assistant',content:[{type:'text',text:polls===1?'I will':'I will check.'}],time:{},finish:'tool-calls'}]};
 };
 const deltas=[];const result=await backend.generate(request,{signal:AbortSignal.timeout(1000),onDelta:async value=>deltas.push(value)});
 assert.deepEqual(deltas,['I will',' check.']);assert.equal(result.calls[0].name,'exec_command');assert.equal(result.calls[0].namespace,'functions');
});

test('Dispatch continuations request chronological snapshots and complete on the newest assistant',async t=>{
 const {backend}=fixture(t,()=>{});const original=backend.call.bind(backend);
 backend.call=async(route,options)=>{
  if(!route.includes('/message'))return original(route,options);
  assert.match(route,/order=asc/);
  return {data:[
   {id:'a',type:'assistant',content:[{type:'text',text:'Working'}],finish:'tool-calls',time:{completed:1}},
   {id:'b',type:'assistant',content:[{type:'text',text:'Done'}],finish:'stop',time:{completed:2}},
  ]};
 };
 const deltas=[];await backend.generate(request,{signal:AbortSignal.timeout(1000),onDelta:async value=>deltas.push(value)});
 assert.equal(deltas.join(''),'Working\n\nDone');
});
