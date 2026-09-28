// Optional integration test against an installed Codex Router checkout.
// Uses only generated credentials and a fake upstream; never loads real keys.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {makeWriter} from '../src/protocol.mjs';
const flag=process.argv.indexOf('--router-root');
if(flag<0||!process.argv[flag+1])throw new Error('Usage: node scripts/router-rehearsal.mjs --router-root /absolute/installed/codex-router');
const router=path.resolve(process.argv[flag+1]);
const state=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-router-rehearsal-'));
process.env.MODEL_ROUTER_STATE_DIR=state;
// Remove inherited path overrides so helper modules cannot write live state.
for(const key of ['MODEL_ROUTER_GENERIC_PROVIDERS','MODEL_ROUTER_USER_MODELS','MODEL_ROUTER_PROVIDER_CREDENTIAL_STORE','MODEL_ROUTER_PROVIDER_CREDENTIAL_MIGRATIONS'])delete process.env[key];
const mod=name=>import(pathToFileURL(path.join(router,'src',name+'.mjs')).href);
const processes=[];let upstream,received;
const receipt={date:new Date().toISOString(),type:'mock-upstream-router-integration',checks:{}};
try{
 const generic=await mod('generic-providers');const credentials=await mod('provider-credentials');
 const store=await mod('provider-credential-store');const users=await mod('user-models');
 const providerId='opencode-native-bridge';
 const token=randomBytes(32).toString('hex');
 generic.addGenericProvider({id:providerId,displayName:'OpenCode Native Bridge',baseUrl:'http://127.0.0.1:4697/v1',adapter:'openai-responses',allowPrivate:true});
 credentials.writeGenericProviderCredential(providerId,token);
 const ref=store.addGenericProviderCredentialReference({providerId,label:'Isolated rehearsal'});
 generic.updateGenericProvider(providerId,{credentialRef:ref.id});
 const model=users.userModelEntry({providerId,upstreamId:'opencode/nemotron-3-ultra-free',priority:100,metadata:{displayName:'Nemotron 3 Ultra Free (OpenCode Bridge)',description:'Experimental native client tool relay',contextWindow:32000,autoCompact:26000,inputModalities:['text'],defaultEffort:'default',reasoningLevels:[{effort:'default',description:'Upstream default'}],supportsReasoningSummaries:false,supportedEndpoints:['/responses']}});
 users.writeUserModels([model]);
 const validation=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(pathToFileURL(path.join(router,'src/model-registry.mjs')).href)});console.log(JSON.stringify({found:!!m.MODEL_BY_SLUG.get(${JSON.stringify(model.slug)}),warnings:m.USER_MODEL_WARNINGS}));`],{env:process.env,encoding:'utf8'});
 const validated=JSON.parse(validation.stdout);assert.equal(validated.found,true);assert.deepEqual(validated.warnings,[]);receipt.checks.registryAccepted=true;
 const bundled=spawnSync('codex',['debug','models','--bundled'],{encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(bundled.status,0);
 const native=JSON.parse(bundled.stdout);const nativeModels=native.models||native;
 const bridgeModel=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url))).models[0];
 const catalog={models:[...nativeModels,{...bridgeModel,slug:model.slug}]};
 fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify(catalog),{mode:0o600});
 receipt.checks.nativeCatalogPreserved=nativeModels.every((entry,index)=>JSON.stringify(entry)===JSON.stringify(catalog.models[index]));
 upstream=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  assert.equal(req.headers.authorization,'Bearer '+token);
  received=JSON.parse(body);
  const writer=makeWriter(res,'responses',{model:received.model,stream:true});
  writer.calls([{type:'function_call',id:'fc_mock',call_id:'call_mock',name:'probe',namespace:'client',arguments:'{"value":17}'}]);writer.finish(null);
 });
 await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(4697,'127.0.0.1',resolve);});
 const caller=randomBytes(32).toString('hex');const internal=randomBytes(32).toString('hex');
 const env={...process.env,CODEX_ROUTER_PORT:'4696',CODEX_ROUTER_API_PORT:'4698',CODEX_ROUTER_GATEWAY_PORT:'4699',CODEX_ROUTER_GATEWAY_BASE_URL:'http://127.0.0.1:4699/v1',CODEX_ROUTER_API_FORWARD_BASE_URL:'http://127.0.0.1:4698/v1',CODEX_ROUTER_CALLER_KEY:caller,CODEX_ROUTER_INTERNAL_KEY:internal,CODEX_ROUTER_QUIET:'1',LITELLM_TELEMETRY:'false'};
 const gatewayConfig=`model_list:\n  - model_name: ${model.gatewayModel}\n    litellm_params:\n      model: openai/responses/${model.gatewayModel}\n      api_base: http://127.0.0.1:4698/v1\n      api_key: os.environ/CODEX_ROUTER_INTERNAL_KEY\n      num_retries: 0\nlitellm_settings:\n  drop_params: true\nrouter_settings:\n  disable_cooldowns: true\n  num_retries: 0\ngeneral_settings:\n  disable_spend_logs: true\n`;
 fs.writeFileSync(path.join(state,'gateway.yaml'),gatewayConfig,{mode:0o600});
 function start(binary,args){const child=spawn(binary,args,{env,stdio:'ignore'});child.on('error',error=>{child.startError=error;});processes.push(child);return child;}
 async function ready(url,child){for(let i=0;i<150;i++){if(child.startError||child.exitCode!==null)throw new Error('Isolated router component failed to start.');try{if((await fetch(url,{signal:AbortSignal.timeout(500)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error('Isolated component readiness timed out.');}
 start(process.execPath,[path.join(router,'src/api-forwarder.mjs')]);
 const gateway=start(path.join(router,'.venv/bin/litellm'),['--config',path.join(state,'gateway.yaml'),'--host','127.0.0.1','--port','4699']);
 await ready('http://127.0.0.1:4699/health/liveliness',gateway);
 const front=start(process.execPath,[path.join(router,'src/router.mjs')]);
 const body={model:model.slug,input:'Call client.probe',tools:[{type:'namespace',name:'client',tools:[{type:'function',name:'probe',parameters:{type:'object',properties:{value:{type:'integer'}}}}]}],stream:true,reasoning:{effort:'default',summary:'none'}};
 let response;
 for(let i=0;i<50;i++){if(front.startError||front.exitCode!==null)throw new Error('Isolated router failed.');try{response=await fetch('http://127.0.0.1:4696/v1/responses',{method:'POST',headers:{authorization:'Bearer '+caller,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.equal(response?.status,200);const wire=await response.text();
 assert.equal(received.model,model.upstreamModel);assert.deepEqual(received.tools,body.tools);assert.deepEqual(received.reasoning,body.reasoning);assert.ok(wire.includes('call_mock'));
 Object.assign(receipt.checks,{modelMapped:true,toolNamespacePreserved:true,reasoningPreserved:true,callIdReturned:true});
}catch(error){receipt.error=error.message.replaceAll(state,'<temporary-state>');process.exitCode=1;}
finally{
 for(const child of processes.reverse())if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}
 if(upstream){upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
 fs.rmSync(state,{recursive:true,force:true,maxRetries:3,retryDelay:200});receipt.checks.stateRemoved=!fs.existsSync(state);
 receipt.passed=!receipt.error&&Object.values(receipt.checks).every(Boolean);
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/router-rehearsal.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
