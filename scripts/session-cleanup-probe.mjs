// Fault-inject a lost HTTP creation reply after the official runtime commits it.
// No model prompts are sent; an unrelated unprompted session must survive.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {once} from 'node:events';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {readConfig} from '../src/config.mjs';import {startOpenCode,OpenCodeBackend} from '../src/opencode.mjs';
if(!process.argv.includes('--live-runtime'))throw new Error('Use --live-runtime. No model generation requests are sent.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-cleanup-probe-'));
const hash=createHash('sha256');for(const name of fs.readdirSync(new URL('../src/',import.meta.url)).filter(x=>x.endsWith('.mjs')).sort()){hash.update(name);hash.update(fs.readFileSync(new URL('../src/'+name,import.meta.url)));}
const receipt={date:new Date().toISOString(),sourceSha256:hash.digest('hex'),modelGenerations:0,checks:{}};
let runtime,proxy,sentinel,owned;let prompts=0;
try{
 runtime=await startOpenCode(readConfig({...process.env,BRIDGE_STATE_DIR:root,BRIDGE_MODE:'text',BRIDGE_PORT:'5196',OPENCODE_PORT:'5197'}));receipt.opencode=(await runtime.backend.health()).version;
 sentinel='ses_'+randomUUID().replaceAll('-','');
 await runtime.backend.call('/api/session',{method:'POST',body:{id:sentinel,title:'Temporary unrelated cleanup control',location:{directory:runtime.backend.directory},model:{providerID:'opencode',id:'space-bunny-free'},agent:'plan'}});
 proxy=http.createServer(async(req,res)=>{try{
  let body='';for await(const chunk of req)body+=chunk;
  if(req.url.endsWith('/prompt')){prompts++;res.writeHead(500);res.end();return;}
  const upstream=await fetch(runtime.backend.url+req.url,{method:req.method,headers:{authorization:runtime.backend.authorization,'content-type':'application/json'},...(body?{body}:{}),signal:AbortSignal.timeout(10000)});
  const text=await upstream.text();
  if(req.method==='POST'&&req.url==='/api/session'){
   owned=JSON.parse(body).id;assert.equal(upstream.status,200);assert.equal(JSON.parse(text).data.id,owned);receipt.checks.clientSelectedIdAccepted=true;
   res.destroy();return;
  }
  res.writeHead(upstream.status,{'content-type':'application/json'});res.end(text);
 }catch{res.destroy();}});
 proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 const backend=new OpenCodeBackend({url:`http://127.0.0.1:${proxy.address().port}`,password:'fault-probe',directory:runtime.backend.directory});
 await assert.rejects(backend.generate({model:'opencode/space-bunny-free',prompt:'This must never reach the runtime'},{signal:AbortSignal.timeout(15000),onDelta:()=>{}}));
 assert.ok(owned);assert.equal(prompts,0);receipt.checks.noPromptAfterLostReply=true;
 const status=await fetch(runtime.backend.url+'/api/session/'+owned,{headers:{authorization:runtime.backend.authorization},signal:AbortSignal.timeout(2000)});await status.body?.cancel();assert.equal(status.status,404);receipt.checks.committedSessionRemoved=true;
 const unrelated=await runtime.backend.call('/api/session/'+sentinel);assert.equal(unrelated.data.id,sentinel);receipt.checks.unrelatedSessionPreserved=true;receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-workspace>');process.exitCode=1;}
finally{
 if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
 if(runtime){for(const id of [owned,sentinel].filter(Boolean))await runtime.backend.call('/api/session/'+id,{method:'DELETE'}).catch(()=>{});await runtime.stop();}
 fs.rmSync(root,{recursive:true,force:true});const output=process.env.BRIDGE_RECEIPT||'generated/session-cleanup-probe.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}
