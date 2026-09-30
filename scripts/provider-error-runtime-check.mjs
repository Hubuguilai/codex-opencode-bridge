// Official runtime with a loopback fault provider: no paid/free model inference.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import net from 'node:net';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readConfig} from '../src/config.mjs';import {startOpenCode} from '../src/opencode.mjs';import {createBridge} from '../src/server.mjs';
if(process.argv[2]!=='--live-runtime')throw Error('Use --live-runtime to start the official runtime with a local fault fixture.');
const mode=process.argv[3] || 'text';
assert.ok(['text','native-tools'].includes(mode));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-provider-errors-'));
const cases=[
 {name:'context',status:400,message:'Maximum context length exceeded.',expected:'context_length_exceeded',http:400},
 {name:'tool-schema',status:422,message:'Invalid schema for function example.',expected:'upstream_tool_schema',http:422},
 {name:'unknown',status:400,message:'Unknown request property.',expected:'generation_failed',http:502},
 {name:'authentication',status:401,message:'Invalid API key.',expected:'upstream_access_or_quota',http:401},
 {name:'access',status:403,message:'Access denied.',expected:'upstream_access_or_quota',http:403},
 {name:'quota',status:429,message:'Rate limit exceeded.',expected:'upstream_access_or_quota',http:429},
];
let current,requests=0,runtime,bridge;
const mock=http.createServer((req,res)=>{requests++;req.resume();res.writeHead(current.status,{'content-type':'application/json','retry-after':'0'});res.end(JSON.stringify({error:{type:'invalid_request_error',message:current.message+' PRIVATE_FIXTURE_SENTINEL'}}));});
const receipt={date:new Date().toISOString(),kind:'official-runtime-local-provider-errors',mode,realProviderInference:false,modelsTested:[],checks:[]};
const digest=createHash('sha256');for(const name of ['opencode.mjs','provider-errors.mjs','server.mjs','protocol.mjs','runtime-policy.mjs','runtime-plugin.mjs'])digest.update(name).update(fs.readFileSync(new URL('../src/'+name,import.meta.url)));receipt.sourceSha256=digest.digest('hex');
try{
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const upstreamPort=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env,BRIDGE_STATE_DIR:root,OPENCODE_PORT:String(upstreamPort),BRIDGE_MODE:mode,BRIDGE_MODELS:'probe/test'};
 const config=readConfig(env);runtime=await startOpenCode(config,env);receipt.runtime=(await runtime.backend.health()).version;assert.equal(receipt.runtime,'2.0.18');
 const file=path.join(runtime.backend.directory,'opencode.json'),base=JSON.parse(fs.readFileSync(file));assert.equal(base.compaction.auto,false);
 fs.writeFileSync(file,JSON.stringify({...base,warming:false,providers:{probe:{package:'@ai-sdk/openai-compatible',settings:{baseURL:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'local-fixture-only'},models:{test:{name:'Local error fixture',limit:{context:32768,output:1000},capabilities:{tools:false,input:['text'],output:['text']}}}}}}));
 bridge=createBridge({...config,port:0},runtime.backend);const address=await bridge.listen();
 for(const scenario of cases){
  current=scenario;const before=requests;
  for(const stream of [false,true]){
   const response=await fetch(`http://127.0.0.1:${address.port}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify({model:'probe/test',input:'Synthetic error fixture.',stream}),signal:AbortSignal.timeout(45000)});
   const wire=await response.text();assert.ok(!wire.includes('PRIVATE_FIXTURE_SENTINEL'));assert.ok(!wire.includes('local-fixture-only'));assert.ok(wire.includes(scenario.expected));
   if(stream){assert.ok(wire.includes('response.failed'));assert.ok(!wire.includes('response.completed'));}else assert.equal(response.status,scenario.http);
  }
  assert.equal(requests-before,2,'Failure triggered an extra provider request or compaction');
  receipt.checks.push({name:scenario.name,jsonAndStreamPassed:true,localProviderRequests:requests-before});
 }
 receipt.runtimeCompactionDisabled=true;receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-directory>');process.exitCode=1;}
finally{
 if(bridge)await bridge.close();if(runtime)await runtime.stop();mock.closeAllConnections();await new Promise(r=>mock.close(r));fs.rmSync(root,{recursive:true,force:true});receipt.cleaned=true;
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync(`generated/provider-error-runtime-${mode}.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
