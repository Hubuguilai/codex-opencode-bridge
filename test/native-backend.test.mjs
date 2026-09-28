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
