// Real HTTP on both sides of the bridge. The OpenCode API is a local fixture;
// this test establishes bridge behavior, not runtime/provider capacity.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OpenCodeBackend} from '../src/opencode.mjs';
import {createBridge} from '../src/server.mjs';
import plugin from '../src/runtime-plugin.mjs';
const tools=Array.from({length:300},(_,i)=>({type:'function',name:`action_${i}`,description:`Action ${i}`,parameters:{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false}}));
for(const scenario of ['relay','limit','unknown','oversize'])test(`300-tool HTTP integration: ${scenario}`,async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-300-'));
 const hooks={},registered=[],controller=new AbortController(),routes=[];let pending;
 await plugin.setup({location:{directory},session:{hook:async(n,f)=>{hooks[n]=f;}},permission:{hook:async()=>{}},tool:{hook:async()=>{},transform:async f=>{f({add:x=>registered.push(x)});return{dispose:async()=>{}};}}});
 const upstream=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};routes.push([req.url,req.method]);res.setHeader('content-type','application/json');
  if(req.url==='/api/session')return res.end(JSON.stringify({data:{id:body.id}}));
  if(req.url.endsWith('/prompt')){
   await hooks.prompt();assert.equal(registered.length,300);
   const manifest=JSON.parse(fs.readFileSync(path.join(directory,'bridge-request.json')));
   assert.equal(new Set(registered.map(x=>x.name)).size,300);
   for(let i=0;i<300;i++){assert.equal(manifest.tools[i].name,tools[i].name);assert.equal(manifest.tools[i].namespace,'connectors');assert.deepEqual(registered[i].input,tools[i].parameters);}
   if(scenario==='relay')pending=registered[299].execute({marker:'last'},{signal:controller.signal}).catch(e=>e);
  }
  if(req.url.includes('/message'))return res.end(JSON.stringify({data:scenario==='relay'?[]:[{type:'assistant',finish:'error',error:{type:'provider.invalid-request',status:400,message:scenario==='limit'?'Too many tools: maximum 128. PRIVATE_SENTINEL':'Unknown PRIVATE_SENTINEL'}}]}));
  if(req.url.endsWith('/interrupt'))controller.abort();
  res.end('{}');
 });
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const backend=new OpenCodeBackend({url:`http://127.0.0.1:${upstream.address().port}`,password:'test',directory,mode:'native-tools',pollMs:1});
 const config={host:'127.0.0.1',port:0,token:'local-fixture',models:['probe/test'],mode:'native-tools',maxBodyBytes:scenario==='oversize'?1024:1000000,maxConcurrent:1,timeoutMs:5000};
 const bridge=createBridge(config,backend),address=await bridge.listen();
 t.after(async()=>{controller.abort();await pending;await bridge.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));fs.rmSync(directory,{recursive:true,force:true});});
 const response=await fetch(`http://127.0.0.1:${address.port}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify({model:'probe/test',input:'Call action_299 with marker last.',tools:[{type:'namespace',name:'connectors',tools}]})});
 const body=await response.json();
 if(scenario==='relay'){
  assert.equal(response.status,200);const call=body.output.find(x=>x.type==='function_call');assert.equal(call.name,'action_299');assert.equal(call.namespace,'connectors');assert.deepEqual(JSON.parse(call.arguments),{marker:'last'});
 }else{assert.equal(response.status,scenario==='oversize'?413:scenario==='limit'?422:502);assert.equal(body.error.code,scenario==='oversize'?'input_too_large':scenario==='limit'?'upstream_tool_limit':'generation_failed');assert.doesNotMatch(JSON.stringify(body),/PRIVATE_SENTINEL/);}
 if(scenario==='oversize')assert.equal(routes.length,0);
 else{assert.equal(routes.filter(x=>x[0]==='/api/session').length,1);assert.ok(routes.at(-2)[0].endsWith('/interrupt'));assert.equal(routes.at(-1)[1],'DELETE');}
 assert.equal(Boolean(backend.busy),false);assert.equal(fs.existsSync(path.join(directory,'bridge-request.json')),false);
});
