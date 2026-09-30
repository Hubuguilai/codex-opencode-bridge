// Optional integration test against an installed Codex Router checkout.
// Uses only generated credentials and a fake upstream; never loads real keys.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {makeWriter} from '../src/protocol.mjs';
import {verificationImage} from '../src/verification-image.mjs';
const flag=process.argv.indexOf('--router-root');
if(flag<0||!process.argv[flag+1])throw new Error('Usage: node scripts/router-rehearsal.mjs --router-root /absolute/installed/codex-router');
const router=path.resolve(process.argv[flag+1]);
const planFlag=process.argv.indexOf('--plan');
const planRoot=planFlag<0?null:path.resolve(process.argv[planFlag+1]);
const exported=planRoot?JSON.parse(fs.readFileSync(path.join(planRoot,'router-plan.json'))):null;
if(exported&&(exported.kind!=='codex-opencode-router-plan'||exported.version!==1||!exported.models?.length))throw new Error('Invalid exported router plan.');
const state=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-router-rehearsal-'));
process.env.MODEL_ROUTER_STATE_DIR=state;
// Remove inherited path overrides so helper modules cannot write live state.
for(const key of ['MODEL_ROUTER_GENERIC_PROVIDERS','MODEL_ROUTER_USER_MODELS','MODEL_ROUTER_PROVIDER_CREDENTIAL_STORE','MODEL_ROUTER_PROVIDER_CREDENTIAL_MIGRATIONS'])delete process.env[key];
const mod=name=>import(pathToFileURL(path.join(router,'src',name+'.mjs')).href);
const processes=[];let upstream,received;
const receipt={date:new Date().toISOString(),type:'mock-upstream-router-integration',checks:{},routerRevision:spawnSync('git',['rev-parse','HEAD'],{cwd:router,encoding:'utf8'}).stdout.trim()};
const routerHash=createHash('sha256');
for(const name of fs.readdirSync(path.join(router,'src')).filter(x=>x.endsWith('.mjs')).sort()){routerHash.update(name);routerHash.update(fs.readFileSync(path.join(router,'src',name)));}
receipt.routerSourceSha256=routerHash.digest('hex');
receipt.routerWorktreeDirty=Boolean(spawnSync('git',['status','--porcelain'],{cwd:router,encoding:'utf8'}).stdout.trim());
if(planRoot)receipt.planSha256=createHash('sha256').update(fs.readFileSync(path.join(planRoot,'router-plan.json'))).digest('hex');
try{
 const generic=await mod('generic-providers');const credentials=await mod('provider-credentials');
 const store=await mod('provider-credential-store');const users=await mod('user-models');
 const providerId=exported?.provider.id||'opencode-native-bridge';
 const token=randomBytes(32).toString('hex');
 generic.addGenericProvider({id:providerId,displayName:'OpenCode Native Bridge',baseUrl:'http://127.0.0.1:4697/v1',adapter:'openai-responses',allowPrivate:true});
 credentials.writeGenericProviderCredential(providerId,token);
 const ref=store.addGenericProviderCredentialReference({providerId,label:'Isolated rehearsal'});
 generic.updateGenericProvider(providerId,{credentialRef:ref.id});
 const model=users.userModelEntry({providerId,upstreamId:'opencode/nemotron-3-ultra-free',priority:100,metadata:{displayName:'Nemotron 3 Ultra Free (OpenCode Bridge)',description:'Experimental native client tool relay',contextWindow:32000,autoCompact:26000,inputModalities:['text'],defaultEffort:'default',reasoningLevels:[{effort:'default',description:'Upstream default'}],supportsReasoningSummaries:false,supportedEndpoints:['/responses']}});
 const models=exported?.models||[model];
 users.writeUserModels(models);
 receipt.models=models.map(x=>x.slug);
 const validation=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(pathToFileURL(path.join(router,'src/model-registry.mjs')).href)});console.log(JSON.stringify({found:${JSON.stringify(models.map(x=>x.slug))}.every(id=>m.MODEL_BY_SLUG.has(id)),warnings:m.USER_MODEL_WARNINGS}));`],{env:process.env,encoding:'utf8'});
 const validated=JSON.parse(validation.stdout);assert.equal(validated.found,true);assert.deepEqual(validated.warnings,[]);receipt.checks.registryAccepted=true;
 const bundled=spawnSync('codex',['debug','models','--bundled'],{encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(bundled.status,0);
 const native=JSON.parse(bundled.stdout);const nativeModels=native.models||native;
 const bridgeModel=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url))).models[0];
 const catalog=planRoot?JSON.parse(fs.readFileSync(path.join(planRoot,'menu-preview.json'))):{models:[...nativeModels,...models.map(m=>({...bridgeModel,slug:m.slug}))]};
 let expectedOriginal=nativeModels;
 if(planRoot){
  const original=fs.readFileSync(exported.sources['merged-models.json'].path);
  assert.equal(createHash('sha256').update(original).digest('hex'),exported.sources['merged-models.json'].sha256,'Source catalog changed since export');
  expectedOriginal=JSON.parse(original).models;
 }
 assert.equal(catalog.models.length,expectedOriginal.length+models.length);
 assert.deepEqual(catalog.models.slice(0,expectedOriginal.length),expectedOriginal);
 receipt.existingCatalogEntries=expectedOriginal.length;receipt.proposedCatalogEntries=catalog.models.length;
 fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify(catalog),{mode:0o600});
 receipt.checks.nativeCatalogPreserved=expectedOriginal.every((entry,index)=>JSON.stringify(entry)===JSON.stringify(catalog.models[index]));
 const parsedCatalog=spawnSync('codex',['debug','models','-c','model_catalog_json='+JSON.stringify(path.join(state,'merged-models.json'))],{encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(parsedCatalog.status,0);
 const loaded=JSON.parse(parsedCatalog.stdout);const loadedModels=loaded.models||loaded;
 assert.ok(models.every(model=>loadedModels.some(entry=>entry.slug===model.slug)));receipt.checks.codexCatalogLoaded=true;
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
 const gatewayConfig='model_list:\n'+models.map(model=>`  - model_name: ${model.gatewayModel}\n    litellm_params:\n      model: openai/responses/${model.gatewayModel}\n      api_base: http://127.0.0.1:4698/v1\n      api_key: os.environ/CODEX_ROUTER_INTERNAL_KEY\n      num_retries: 0\n`).join('')+'litellm_settings:\n  drop_params: true\nrouter_settings:\n  disable_cooldowns: true\n  num_retries: 0\ngeneral_settings:\n  disable_spend_logs: true\n';
 fs.writeFileSync(path.join(state,'gateway.yaml'),gatewayConfig,{mode:0o600});
 function start(binary,args){const child=spawn(binary,args,{env,stdio:'ignore'});child.on('error',error=>{child.startError=error;});processes.push(child);return child;}
 async function ready(url,child){for(let i=0;i<150;i++){if(child.startError||child.exitCode!==null)throw new Error('Isolated router component failed to start.');try{if((await fetch(url,{signal:AbortSignal.timeout(500)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error('Isolated component readiness timed out.');}
 start(process.execPath,[path.join(router,'src/api-forwarder.mjs')]);
 const gateway=start(path.join(router,'.venv/bin/litellm'),['--config',path.join(state,'gateway.yaml'),'--host','127.0.0.1','--port','4699']);
 await ready('http://127.0.0.1:4699/health/liveliness',gateway);
 const front=start(process.execPath,[path.join(router,'src/router.mjs')]);
 receipt.routes=[];
 for(const model of models){
 const body={model:model.slug,input:'Call client.probe',tools:[{type:'namespace',name:'client',tools:[{type:'function',name:'probe',parameters:{type:'object',properties:{value:{type:'integer'}}}}]}],stream:true,reasoning:{effort:'default',summary:'none'}};
 let response;
 for(let i=0;i<50;i++){if(front.startError||front.exitCode!==null)throw new Error('Isolated router failed.');try{response=await fetch('http://127.0.0.1:4696/v1/responses',{method:'POST',headers:{authorization:'Bearer '+caller,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.equal(response?.status,200);const wire=await response.text();
 assert.equal(received.model,model.upstreamModel);assert.deepEqual(received.tools,body.tools);assert.deepEqual(received.reasoning,body.reasoning);assert.ok(wire.includes('call_mock'));
 const events=wire.split('\n').filter(line=>line.startsWith('data: ')&&line!=='data: [DONE]').map(line=>JSON.parse(line.slice(6)));
 const call=events.find(event=>event.type==='response.completed')?.response.output.find(item=>item.type==='function_call');
 assert.equal(call?.name,'probe');assert.equal(call?.namespace,'client');assert.equal(call?.call_id,'call_mock');assert.deepEqual(JSON.parse(call.arguments),{value:17});
 receipt.routes.push({model:model.slug,modelMapped:received.model===model.upstreamModel,toolNamespacePreserved:true,reasoningPreserved:true,callIdReturned:true});
 if(model.inputModalities?.includes('image')){
  const image='data:image/png;base64,'+verificationImage('123456').toString('base64');
  const part={type:'input_image',image_url:image,detail:'original'};
  const samples={uploaded_image:[{role:'user',content:[{type:'input_text',text:'Read this image.'},part]}],
   tool_image:[{type:'function_call',call_id:'image_probe',name:'view_image',arguments:'{}'},
    {type:'function_call_output',call_id:'image_probe',output:[part]}]};
  for(const [name,input]of Object.entries(samples)){
   received=undefined;
   const response=await fetch('http://127.0.0.1:4696/v1/responses',{method:'POST',headers:{authorization:'Bearer '+caller,'content-type':'application/json'},body:JSON.stringify({...body,input}),signal:AbortSignal.timeout(30000)});
   const wire=await response.text();
   assert.equal(response.status,200);assert.ok(wire.includes('response.completed'));
   assert.equal(received?.model,model.upstreamModel);
   assert.ok(JSON.stringify(received.input).includes(image),name+' image bytes missing at bridge ingress');
   if(name==='tool_image')assert.ok(JSON.stringify(received.input).includes('image_probe'));
   receipt.routes.at(-1)[name+'BytesPreserved']=true;
  }
 }else if(model.bridgeStrictImages===true){
  const part={type:'input_image',image_url:'data:image/png;base64,'+verificationImage('123456').toString('base64')};
  const samples={uploaded_image:[{role:'user',content:[part]}],tool_image:[{type:'function_call',call_id:'strict_image_probe',name:'view_image',arguments:'{}'},{type:'function_call_output',call_id:'strict_image_probe',output:[part]}]};
  for(const [name,input]of Object.entries(samples))for(const endpoint of ['router','forwarder']){
   received=undefined;
   const direct=endpoint==='forwarder';
   const rejected=await fetch(`http://127.0.0.1:${direct?4698:4696}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+(direct?internal:caller),'content-type':'application/json'},body:JSON.stringify({...body,model:direct?model.gatewayModel:model.slug,input}),signal:AbortSignal.timeout(10000)});
   const error=await rejected.json();assert.equal(rejected.status,422);assert.equal(error.error.type,'bridge_image_input_unsupported');assert.equal(received,undefined,'Unsupported image reached upstream');
   receipt.routes.at(-1)[endpoint+'_'+name+'RejectedBeforeUpstream']=true;
  }
 }
 }
 Object.assign(receipt.checks,{modelMapped:true,toolNamespacePreserved:true,reasoningPreserved:true,callIdReturned:true});
}catch(error){receipt.error=error.message.replaceAll(state,'<temporary-state>');process.exitCode=1;}
finally{
 for(const child of processes.reverse())if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}
 if(upstream){upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
 fs.rmSync(state,{recursive:true,force:true,maxRetries:3,retryDelay:200});receipt.checks.stateRemoved=!fs.existsSync(state);
 if(exported)receipt.checks.sourceFilesUnchanged=Object.values(exported.sources).every(source=>createHash('sha256').update(fs.readFileSync(source.path)).digest('hex')===source.sha256);
 receipt.passed=!receipt.error&&Object.values(receipt.checks).every(Boolean);
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync(process.env.BRIDGE_RECEIPT||'generated/router-rehearsal.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
