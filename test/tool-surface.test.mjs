import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import plugin from '../src/runtime-plugin.mjs';

test('Hidden mode removes internal registrations and late-added context tools, retaining client schemas', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-surface-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const manifest={requestId:'surface-test',internalTools:'hidden',tools:[{relayName:'bridge_client_echo_0',name:'echo',parameters:{type:'object'}}]};
  fs.writeFileSync(path.join(root,'bridge-request.json'),JSON.stringify(manifest));
  const hooks={}, removed=[], added=[];
  const ctx={location:{directory:root},session:{hook:async(n,f)=>{hooks[n]=f;}},permission:{hook:async()=>{}},tool:{hook:async()=>{},transform:async f=>{
    f({list:()=>[{id:'shell'},{id:'read'},{id:'execute'},{id:'mcp_other'}],remove:id=>removed.push(id),add:tool=>added.push(tool)});
    return {dispose:async()=>{}};
  }}};
  await plugin.setup(ctx);await hooks.prompt();
  assert.deepEqual(removed,['shell','read','execute','mcp_other']);
  assert.equal(added.length,1);
  const schema={description:'client schema',input:{type:'object'}};
  const event={tools:{shell:{},late_mcp:{},bridge_client_echo_0:schema},messages:[],system:[],options:{}};
  hooks.context(event);
  assert.deepEqual(event.tools,{bridge_client_echo_0:schema});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'bridge-tool-surface.json'))).tools,['bridge_client_echo_0']);
  const request=new Request('https://example.invalid/v1/chat/completions',{method:'POST',headers:{authorization:'secret'},body:JSON.stringify({messages:[{content:'private prompt'}],tools:[{type:'function',function:{name:'bridge_client_echo_0',parameters:{}}}]})});
  await hooks['http.request']({kind:'primary',request});
  const wire=fs.readFileSync(path.join(root,'bridge-wire-surface.json'),'utf8');
  assert.deepEqual(JSON.parse(wire).tools,['bridge_client_echo_0']);
  assert.ok(!wire.includes('secret')&&!wire.includes('private prompt'));
  assert.equal((await request.json()).messages[0].content,'private prompt');
  await assert.rejects(hooks['http.request']({kind:'primary',request:new Request('https://example.invalid',{method:'POST',body:JSON.stringify({tools:[{type:'function',function:{name:'late_internal'}}]})})}),/UNEXPECTED_WIRE_TOOL/);
  await assert.rejects(hooks['http.request']({kind:'primary',request:new Request('https://example.invalid',{method:'POST',body:'not json'})}),/UNVERIFIABLE_TOOL_SURFACE/);
});
