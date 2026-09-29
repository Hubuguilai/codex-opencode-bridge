// Real Codex file changes and approval handling with a deterministic fake model.
// No OpenCode provider request is made. Only temporary client files are changed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash,randomUUID} from 'node:crypto';
import {readConfig} from '../src/config.mjs';
import {createBridge} from '../src/server.mjs';
import plugin from '../src/runtime-plugin.mjs';

if(!process.argv.includes('--client'))throw new Error('Use --client to run real Codex tools in temporary workspaces.');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bridge-patch-client-')));
const work=path.join(root,'client'),upstream=path.join(root,'fake-upstream');fs.mkdirSync(work);fs.mkdirSync(upstream);
const model='opencode/patch-client-probe';
const config=readConfig({...process.env,BRIDGE_STATE_DIR:path.join(root,'state'),BRIDGE_MODE:'native-tools',BRIDGE_MODELS:model});
const hash=createHash('sha256');for(const name of fs.readdirSync(new URL('../src/',import.meta.url)).filter(x=>x.endsWith('.mjs')).sort()){hash.update(name);hash.update(fs.readFileSync(new URL('../src/'+name,import.meta.url)));}
const receipt={date:new Date().toISOString(),sourceSha256:hash.digest('hex'),codex:spawnSync('codex',['--version'],{encoding:'utf8'}).stdout.trim(),upstream:'deterministic-fake-model',modelGenerations:0,scenarios:[]};
let child,bridge,sequence=0,scenario,transferred=false,historyReturned=false,approvals=0;
const events=[],pending=new Map();
const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
function rpc(method,params){return new Promise((resolve,reject)=>{
 const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('client_rpc_timeout'));},20000);
 pending.set(id,{resolve:result=>{clearTimeout(timer);resolve(result);},reject:error=>{clearTimeout(timer);reject(error);}});send({id,method,params});
});}
const backend={
 health:async()=>({version:'mock'}),
 generate:async(request,{onDelta})=>{
  if(transferred){
   historyReturned=request.messages.some(message=>message.role==='tool');
   assert.equal(historyReturned,true,'Codex tool result must return to the model');
   await onDelta('Client operation finished.');return {tokens:null};
  }
  const hooks={},registry=[];
  fs.writeFileSync(path.join(upstream,'bridge-request.json'),JSON.stringify({requestId:'patch-probe',internalTools:'client-aliases',tools:request.tools}),{mode:0o600});
  const ctx={location:{directory:upstream},session:{hook:async(n,f)=>{hooks['session.'+n]=f;}},permission:{hook:async(n,f)=>{hooks['permission.'+n]=f;}},tool:{hook:async(n,f)=>{hooks['tool.'+n]=f;},transform:async f=>{f({list:()=>registry,update:(id,change)=>change(registry.find(x=>x.id===id)),add:tool=>registry.push(tool)});return{dispose:async()=>{}};}}};
  await plugin.setup(ctx);await hooks['session.prompt']();
  assert.equal(registry.some(tool=>tool.name==='apply_patch'),true,'Actual Codex must supply a compatible patch tool');
  assert.throws(()=>hooks['tool.execute.before']({tool:'apply_patch',input:{patchText:scenario.patch}}),/CLIENT_TRANSFER_RECORDED/);
  const capture=JSON.parse(fs.readFileSync(path.join(upstream,'bridge-call.json')));
  const target=request.tools.find(tool=>tool.relayName===capture.relayName);
  assert.equal(target.kind,'custom');assert.equal(capture.input.input,scenario.patch);
  transferred=true;
  return {calls:[{type:'custom_tool_call',id:'fc_'+randomUUID(),call_id:'call_'+randomUUID(),name:target.name,...(target.namespace?{namespace:target.namespace}:{}),input:capture.input.input}],tokens:null};
 },
};
try{
 bridge=createBridge({...config,port:0},backend);const address=await bridge.listen();
 const catalog=path.join(root,'models.json'),template=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url)));
 template.models[0].slug=model;fs.writeFileSync(catalog,JSON.stringify(template));
 const overrides={model_provider:'patch_probe',model,'model_providers.patch_probe.name':'Patch probe','model_providers.patch_probe.base_url':`http://127.0.0.1:${address.port}/v1`,'model_providers.patch_probe.wire_api':'responses','model_providers.patch_probe.env_key':'BRIDGE_TOKEN','model_providers.patch_probe.requires_openai_auth':false,'model_providers.patch_probe.request_max_retries':0,'model_providers.patch_probe.stream_max_retries':0,model_catalog_json:catalog,model_reasoning_effort:'default',model_reasoning_summary:'none',web_search:'disabled','features.apps':false,'features.multi_agent':false,'features.memories':false};
 child=spawn('codex',['app-server','--stdio',...Object.entries(overrides).flatMap(([key,value])=>['-c',key+'='+JSON.stringify(value)])],{cwd:work,env:{...process.env,BRIDGE_TOKEN:config.token},stdio:['pipe','pipe','ignore']});
 child.once('exit',()=>{for(const waiter of pending.values())waiter.reject(new Error('client_exited'));pending.clear();});
 createInterface({input:child.stdout}).on('line',line=>{
  let event;try{event=JSON.parse(line);}catch{return;}
  if(event.id!==undefined&&event.method){
   if(event.method.endsWith('/requestApproval')){approvals++;send({id:event.id,result:{decision:'decline'}});}
   else send({id:event.id,error:{code:-32601,message:'Unsupported probe request'}});
  }else if(event.id!==undefined){const waiter=pending.get(event.id);pending.delete(event.id);if(waiter)event.error?waiter.reject(new Error('client_rpc_failed')):waiter.resolve(event.result);}
  else events.push(event);
 });
 await rpc('initialize',{clientInfo:{name:'bridge_patch_probe',version:'0.2.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
 const cases=[
  {name:'create',patch:'*** Begin Patch\n*** Add File: result.txt\n+alpha\n*** End Patch',expected:'alpha\n'},
  {name:'update',patch:'*** Begin Patch\n*** Update File: result.txt\n@@\n-alpha\n+βeta\n*** End Patch',expected:'βeta\n'},
  {name:'denial',patch:'*** Begin Patch\n*** Add File: denied.txt\n+must not appear\n*** End Patch',deny:true},
 ];
 for(scenario of cases){
  transferred=false;historyReturned=false;const before=events.length,approvalBefore=approvals;
  const {thread}=await rpc('thread/start',{cwd:work,model,modelProvider:'patch_probe',ephemeral:true,approvalPolicy:scenario.deny?'untrusted':'on-request',sandbox:scenario.deny?'read-only':'workspace-write',baseInstructions:'Use client apply_patch for the requested file change. Respect any denial.',config:overrides});
  const {turn}=await rpc('turn/start',{threadId:thread.id,input:[{type:'text',text:'Apply the requested test change.'}]});
  const deadline=Date.now()+30000;let completed;
  while(Date.now()<deadline){completed=events.slice(before).find(event=>event.method==='turn/completed'&&event.params.turn.id===turn.id);if(completed)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(completed?.params.turn.status,'completed');
  const items=events.slice(before).filter(event=>event.method==='item/completed').map(event=>event.params.item);
  const changes=items.filter(item=>item.type==='fileChange');
  assert.equal(items.some(item=>item.type==='commandExecution'),false);
  assert.ok(changes.length>0);
  if(scenario.deny){assert.ok(approvals>approvalBefore);assert.equal(fs.existsSync(path.join(work,'denied.txt')),false);}
  else {assert.equal(fs.readFileSync(path.join(work,'result.txt'),'utf8'),scenario.expected);assert.ok(changes.some(item=>item.changes?.some(change=>typeof change.diff==='string'&&change.diff.length>0)));}
  assert.equal(fs.existsSync(path.join(upstream,'result.txt')),false);assert.equal(fs.existsSync(path.join(upstream,'denied.txt')),false);
  receipt.scenarios.push({name:scenario.name,passed:true,nativeFileChanges:changes.length,commandExecutions:0,approvalRequests:approvals-approvalBefore,toolResultReturned:historyReturned});
 }
 receipt.passed=true;
}catch{receipt.passed=false;receipt.error='patch_client_probe_failed';process.exitCode=1;}
finally{
 if(child)child.kill('SIGTERM');if(bridge)await bridge.close();
 fs.rmSync(root,{recursive:true,force:true});
 const output=process.env.BRIDGE_RECEIPT||'generated/patch-client-probe.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}
