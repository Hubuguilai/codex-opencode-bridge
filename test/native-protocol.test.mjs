import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import plugin from '../src/runtime-plugin.mjs';
import { normalizeNativeRequest, normalizeTools } from '../src/native-protocol.mjs';
import { makeWriter } from '../src/protocol.mjs';
const config = { models: ['opencode/test'], maxBodyBytes: 100000 };
const fn = { type: 'function', name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } };

test('Namespace and custom tool definitions retain original identities with distinct relay names', () => {
 const tools=normalizeTools([fn,{type:'namespace',name:'files',tools:[fn]},{type:'custom',name:'apply_patch',format:{type:'text'}}]);
 assert.equal(tools.length,3);assert.equal(tools[1].namespace,'files');
 assert.equal(new Set(tools.map(t=>t.relayName)).size,3);assert.equal(tools[2].kind,'custom');
 assert.deepEqual(tools[2].parameters.required,['input']);
 assert.throws(()=>normalizeTools([fn,fn]),{status:400});
});

test('Historical tool calls/results survive normalization; unknown or missing results are refused', () => {
 const input=[{role:'user',content:'Read it'},{type:'function_call',name:'read_file',call_id:'a',arguments:'{"path":"x"}'},{type:'function_call_output',call_id:'a',output:'random marker'}];
 const result=normalizeNativeRequest({model:'opencode/test',input,tools:[fn],reasoning:{summary:'auto'}},'responses',config);
 assert.match(result.prompt,/random marker/);assert.match(result.prompt,/call_id/);
 assert.throws(()=>normalizeNativeRequest({model:'opencode/test',input:input.slice(0,2)},'responses',config),{status:400});
 assert.throws(()=>normalizeNativeRequest({model:'opencode/test',input:[input[2]]},'responses',config),{status:400});
});

test('Chat assistant calls and tool messages become complete client history', () => {
 const messages=[{role:'assistant',content:null,tool_calls:[{id:'a',type:'function',function:{name:'read_file',arguments:'{}'}}]}, {role:'tool',tool_call_id:'a',content:'DENIED BY USER'}];
 const result=normalizeNativeRequest({model:'opencode/test',messages,tools:[{type:'function',function:fn}]},'chat',config);
 assert.match(result.prompt,/DENIED BY USER/);assert.equal(result.tools[0].name,'read_file');
});

test('Unsupported provider-hosted tools and image results fail explicitly', () => {
 assert.throws(()=>normalizeTools([{type:'web_search'}]),{status:422});
 assert.throws(()=>normalizeNativeRequest({model:'opencode/test',input:[{role:'user',content:[{type:'input_image',image_url:'x'}]}]},'responses',config),{status:422});
});

test('Function/custom call streaming uses matching IDs, namespaces and completed output', () => {
 let wire='';const res={writeHead(){},flushHeaders(){},write(x){wire+=x;},end(x=''){wire+=x;}};
 const writer=makeWriter(res,'responses',{model:'opencode/test',stream:true});
 const calls=[{type:'function_call',id:'fc_1',call_id:'call_1',namespace:'files',name:'read_file',arguments:'{"path":"x"}'},{type:'custom_tool_call',id:'fc_2',call_id:'call_2',name:'apply_patch',input:'*** Begin Patch\n*** End Patch'}];
 writer.calls(calls);writer.finish(null);
 const events=wire.split('\n').filter(x=>x.startsWith('data: ')).map(x=>JSON.parse(x.slice(6)));
 assert.deepEqual(events.at(-1).response.output,calls);
 assert.equal(events.at(-1).response.usage,undefined);
 assert.ok(events.some(x=>x.type==='response.function_call_arguments.delta'&&x.item_id==='fc_1'));
 assert.ok(events.some(x=>x.type==='response.custom_tool_call_input.delta'&&x.item_id==='fc_2'));
 assert.ok(!events.some(x=>x.type==='response.output_text.delta'));
});

test('Runtime guard blocks every internal action and only records client transfer without executing it', async t => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-plugin-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const manifest={requestId:'r1',tools:normalizeTools([fn])};fs.writeFileSync(path.join(root,'bridge-request.json'),JSON.stringify(manifest));
 const hooks={};const registered=[];
 const ctx={location:{directory:root},session:{hook:async(name,f)=>{hooks['session.'+name]=f;}},permission:{hook:async(name,f)=>{hooks['permission.'+name]=f;}},tool:{hook:async(name,f)=>{hooks['tool.'+name]=f;},transform:async f=>{f({add:x=>registered.push(x)});return{dispose:async()=>{}};}}};
 await plugin.setup(ctx);await hooks['session.prompt']();
 assert.throws(()=>hooks['tool.execute.before']({tool:'shell'}),/INTERNAL_TOOL_BLOCKED/);
 const permission={action:'read',effect:'allow'};hooks['permission.evaluate'](permission);assert.equal(permission.effect,'deny');
 assert.doesNotThrow(()=>hooks['tool.execute.before']({tool:manifest.tools[0].relayName}));
 const context={tools:{shell:{},read:{},bridge_client_0:{description:'client'}},system:[],options:{}};
 hooks['session.context'](context);assert.ok(context.system[0].text.includes('NOT the client workspace'));
 assert.equal(fs.readFileSync(path.join(root,'bridge-plugin-ready'),'utf8'),'r1');
 await hooks['session.prompt']();
 const controller=new AbortController();const pending=registered.at(-1).execute({path:'client-file'},{signal:controller.signal});
 const capture=JSON.parse(fs.readFileSync(path.join(root,'bridge-call.json')));
 assert.deepEqual(capture,{requestId:'r1',kind:'call',relayName:'bridge_client_0',input:{path:'client-file'}});
 controller.abort();await assert.rejects(pending,/CANCELLED/);
});

test('Explicit upstream-default reasoning is accepted but adjustable effort is never silently ignored', () => {
 const payload={model:'opencode/test',input:'hello',reasoning:{effort:'default'}};
 assert.doesNotThrow(()=>normalizeNativeRequest(payload,'responses',config));
 for(const effort of ['low','medium','high','none']) assert.throws(()=>normalizeNativeRequest({...payload,reasoning:{effort}},'responses',config),{status:422});
});
