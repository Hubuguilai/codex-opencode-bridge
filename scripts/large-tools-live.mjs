// Explicitly authorized real inference only. No local client tool is executed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import assert from 'node:assert/strict';
import {readConfig} from '../src/config.mjs';
import {startOpenCode} from '../src/opencode.mjs';
import {createBridge} from '../src/server.mjs';
const local=process.argv[2]==='--local-provider';
if(!local&&(process.argv[2]!=='--live-model'||!process.env.BRIDGE_TEST_MODEL))throw Error('Use --live-model with BRIDGE_TEST_MODEL and existing authorized OpenCode access.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-live-300-'));
let runtime,bridge,mock;
const receipt={date:new Date().toISOString(),model:local?'probe/test':process.env.BRIDGE_TEST_MODEL,toolCount:300,liveModelRequested:!local,realProviderInference:false,passed:false};
try{
 const listener=net.createServer();await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
 const port=listener.address().port;await new Promise(r=>listener.close(r));
 const env={...process.env,BRIDGE_STATE_DIR:root,BRIDGE_MODELS:receipt.model,BRIDGE_MODE:'native-tools',BRIDGE_TOOL_TRANSPORT:'direct',BRIDGE_INTERNAL_TOOLS:'hidden',OPENCODE_PORT:String(port)};
 const config=readConfig(env);runtime=await startOpenCode(config,env);receipt.runtime=(await runtime.backend.health()).version;
 if(local){
  mock=http.createServer(async(req,res)=>{
   try{
   let raw='';for await(const chunk of req)raw+=chunk;
   const body=JSON.parse(raw);receipt.localProviderRequests=(receipt.localProviderRequests||0)+1;
   const names=body.tools.map(x=>x.function.name);assert.equal(names.length,300);assert.equal(new Set(names).size,300);
   assert.deepEqual([...names].sort(),Array.from({length:300},(_,i)=>`bridge_client_probe_${i}_${i}`).sort());
   for(const tool of body.tools)assert.deepEqual(tool.function.parameters,{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false});
   const name='bridge_client_probe_299_299';
   res.writeHead(200,{'content-type':'text/event-stream'});
   const chunk=(delta,finish_reason=null)=>({id:'fixture',object:'chat.completion.chunk',created:1,model:'test',choices:[{index:0,delta,finish_reason}]});
   res.write('data: '+JSON.stringify(chunk({role:'assistant',tool_calls:[{index:0,id:'fixture_call',type:'function',function:{name,arguments:'{"marker":"capacity-300"}'}}]}))+'\n\n');
   res.end('data: '+JSON.stringify(chunk({},'tool_calls'))+'\n\ndata: [DONE]\n\n');
   }catch{receipt.localProviderAssertionFailed=true;res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Synthetic catalog verification failed.'}}));}
  });
  await new Promise((resolve,reject)=>{mock.once('error',reject);mock.listen(0,'127.0.0.1',resolve);});
  const file=path.join(runtime.backend.directory,'opencode.json'),base=JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(file,JSON.stringify({...base,warming:false,providers:{probe:{package:'@ai-sdk/openai-compatible',settings:{baseURL:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'local-fixture-only'},models:{test:{name:'Local tool fixture',limit:{context:131072,output:1000},capabilities:{tools:true,input:['text'],output:['text']}}}}}}));
 }
 bridge=createBridge({...config,port:0},runtime.backend);const address=await bridge.listen();
 const tools=Array.from({length:300},(_,i)=>({type:'function',name:`probe_${i}`,description:`Synthetic no-op probe ${i}`,parameters:{type:'object',properties:{marker:{type:'string'}},required:['marker'],additionalProperties:false}}));
 const response=await fetch(`http://127.0.0.1:${address.port}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify({model:receipt.model,input:'Call probe_299 exactly once with marker="capacity-300". Do not call any other tool.',tools}),signal:AbortSignal.timeout(config.timeoutMs+5000)});
 const body=await response.json();receipt.httpStatus=response.status;
 for(const [file,key] of [['bridge-wire-surface.json','wireToolCount'],['bridge-tool-surface.json','contextToolCount']]){
  try{receipt[key]=JSON.parse(fs.readFileSync(path.join(runtime.backend.directory,file))).tools.length;}catch{}
 }
 try{receipt.providerHttpStatus=JSON.parse(fs.readFileSync(path.join(runtime.backend.directory,'bridge-wire-status.json'))).status;receipt.realProviderInference=!local;}catch{}
 if(body.error){receipt.errorCode=body.error.code;throw Error('Model request failed; see safe errorCode.');}
 const call=body.output?.find(x=>x.type==='function_call');
 receipt.lastToolRelayed=call?.name==='probe_299'&&JSON.parse(call.arguments).marker==='capacity-300';
 assert.notEqual(receipt.localProviderAssertionFailed,true);assert.equal(receipt.wireToolCount,300);assert.equal(receipt.contextToolCount,300);assert.equal(receipt.lastToolRelayed,true);receipt.passed=true;
}catch(error){receipt.failure=true;receipt.errorCode??=error.code==='EPERM'?'local_listen_not_permitted':'probe_failed';process.exitCode=1;}
finally{
 if(bridge)await bridge.close();if(runtime)await runtime.stop();if(mock){mock.closeAllConnections();await new Promise(r=>mock.close(r));}fs.rmSync(root,{recursive:true,force:true});
 // Fixed metadata only; no prompts, tool arguments, credentials or user paths.
 console.log(JSON.stringify(receipt,null,2));
}
