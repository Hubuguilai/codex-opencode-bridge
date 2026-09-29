// Explicit opt-in live acceptance: real Codex tools, temporary workspaces only.
// Uses installed Codex/OpenCode and the operator's existing OpenCode entitlement.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID,createHash} from 'node:crypto';
import {readConfig} from '../src/config.mjs';
import {startOpenCode} from '../src/opencode.mjs';
import {createBridge} from '../src/server.mjs';

if (!process.argv.includes('--live')) throw new Error('Live upstream use requires --live.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-acceptance-'));
const work=path.join(root,'client');fs.mkdirSync(work);
const marker=randomUUID();
fs.writeFileSync(path.join(work,'input.json'),JSON.stringify({marker,values:[137,281]}));
const testModel=process.env.BRIDGE_TEST_MODEL||'opencode/nemotron-3-ultra-free';
const config=readConfig({...process.env,BRIDGE_MODELS:testModel,BRIDGE_MODE:'native-tools',BRIDGE_STATE_DIR:path.join(root,'state'),BRIDGE_PORT:process.env.BRIDGE_PORT||'4596',OPENCODE_PORT:process.env.OPENCODE_PORT||'4597'});
const catalog=path.join(root,'client-models.json');
const modelTemplate=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url)));
modelTemplate.models[0].slug=testModel;modelTemplate.models[0].display_name=testModel+' (acceptance)';
fs.writeFileSync(catalog,JSON.stringify(modelTemplate),{mode:0o600});
const overrides={
 model_provider:'bridge_acceptance',model:testModel,
 'model_providers.bridge_acceptance.name':'Bridge acceptance',
 'model_providers.bridge_acceptance.base_url':`http://127.0.0.1:${config.port}/v1`,
 'model_providers.bridge_acceptance.wire_api':'responses',
 'model_providers.bridge_acceptance.env_key':'BRIDGE_TOKEN',
 'model_providers.bridge_acceptance.requires_openai_auth':false,
 'model_providers.bridge_acceptance.request_max_retries':0,
 'model_providers.bridge_acceptance.stream_max_retries':0,
 model_catalog_json:catalog,model_reasoning_effort:'default',model_reasoning_summary:'none',
 web_search:'disabled','features.apps':false,'features.multi_agent':false,'features.memories':false,
};
function sourceDigest(){
 const hash=createHash('sha256');
 for(const name of fs.readdirSync(new URL('../src/',import.meta.url)).filter(x=>x.endsWith('.mjs')).sort()){hash.update(name);hash.update(fs.readFileSync(new URL('../src/'+name,import.meta.url)));}
 return hash.digest('hex');
}
const receipt={sourceSha256:sourceDigest(),gitHead:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),date:new Date().toISOString(),model:overrides.model,toolTransport:config.toolTransport,internalTools:config.internalTools,node:process.version,codex:spawnSync('codex',['--version'],{encoding:'utf8'}).stdout.trim(),scenarios:[]};
let runtime,bridge,child,sequence=0,approvalCount=0,stderr='';
const pending=new Map(),events=[];
const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
function rpc(method,params){return new Promise((resolve,reject)=>{
 const id=++sequence;
 const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`RPC timeout: ${method}`));},20000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
 send({id,method,params});
});}
async function startThread(denial=false){return (await rpc('thread/start',{
 cwd:work,model:overrides.model,modelProvider:'bridge_acceptance',ephemeral:true,
 approvalPolicy:denial?'untrusted':'on-request',sandbox:denial?'read-only':'workspace-write',
 baseInstructions:'You are a coding assistant. Use the supplied Codex tools to perform and verify tasks. Respect permission denials and do not retry denied actions. Do not use subagents.',config:overrides,
})).thread.id;}
async function turn(threadId,text){
 const start=events.length,started=Date.now();
 const {turn}=await rpc('turn/start',{threadId,input:[{type:'text',text}]});
 while(Date.now()-started<180000){
  const end=events.slice(start).find(e=>e.method==='turn/completed'&&e.params.turn.id===turn.id);
  if(end)return {status:end.params.turn.status,...(end.params.turn.error?{error:end.params.turn.error.message.replaceAll(root,'<temporary-workspace>')}:{}),commands:events.slice(start).filter(e=>e.method==='item/completed'&&e.params.item.type==='commandExecution').length,durationMs:Date.now()-started};
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 await rpc('turn/interrupt',{threadId,turnId:turn.id});return {status:'timeout',durationMs:Date.now()-started};
}
function record(name,result,checks){const item={name,...result,checks,passed:result.status==='completed'&&Object.values(checks).every(Boolean)};receipt.scenarios.push(item);console.log(JSON.stringify(item));}
function output(){try{return fs.readFileSync(path.join(work,'output.md'),'utf8');}catch{return '';}}
try{
 runtime=await startOpenCode(config);
 if(process.env.BRIDGE_DEBUG_ERRORS){
  const originalCall=runtime.backend.call.bind(runtime.backend);
  runtime.backend.call=async(...args)=>{
   const result=await originalCall(...args);
   for(const item of Array.isArray(result?.data)?result.data:[])if(item.type==='assistant'&&item.error){
    fs.appendFileSync(process.env.BRIDGE_DEBUG_ERRORS,JSON.stringify(item.error)+'\n',{mode:0o600});
   }
   return result;
  };
 }
 receipt.opencode=(await runtime.backend.health()).version;
 bridge=createBridge(config,runtime.backend);await bridge.listen();
 child=spawn('codex',['app-server','--stdio',...Object.entries(overrides).flatMap(([key,value])=>['-c',key+'='+JSON.stringify(value)])],{cwd:work,env:{...process.env,BRIDGE_TOKEN:config.token},stdio:['pipe','pipe','pipe']});
 child.stderr.on('data',data=>{stderr+=data;});
 child.once('exit',()=>{for(const waiter of pending.values())waiter.reject(new Error('Codex app-server exited.'));pending.clear();});
 createInterface({input:child.stdout}).on('line',line=>{
  let event;try{event=JSON.parse(line);}catch{return;}
  if(event.id!==undefined&&event.method){
   if(event.method.endsWith('/requestApproval')){approvalCount++;send({id:event.id,result:{decision:'decline'}});}
   else send({id:event.id,error:{code:-32601,message:'Unsupported acceptance-harness request'}});
  }else if(event.id!==undefined){const waiter=pending.get(event.id);pending.delete(event.id);if(waiter)event.error?waiter.reject(new Error(event.error.message)):waiter.resolve(event.result);}
  else {events.push(event);if(event.method==='item/completed')console.log(JSON.stringify({event:event.method,type:event.params.item.type}));}
 });
 await rpc('initialize',{clientInfo:{name:'bridge_acceptance',version:'0.2.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
 const thread=await startThread();
 if (!process.argv.includes('--repair-only') && !process.argv.includes('--lifecycle-only')) {
 record('create',await turn(thread,'Read input.json using exec_command. Write output.md with the exact marker and sum of values. Run a Python assertion checking both. Reply DONE after actual success.'),{marker:output().includes(marker),sum:output().includes('418'),upstreamDidNotWrite:!fs.existsSync(path.join(runtime.backend.directory,'output.md'))});
 record('followup',await turn(thread,'Revise the same output.md: preserve marker and sum, append PRODUCT=38497 computed from input.json. Verify all three using a Python assertion. Perform the change using exec_command.'),{marker:output().includes(marker),sum:output().includes('418'),product:output().includes('38497')});
 }
 if (!process.argv.includes('--lifecycle-only')) {
 fs.writeFileSync(path.join(work,'calculator.py'),'def total(values):\n    return sum(values) - 1\n');
 fs.writeFileSync(path.join(work,'test_calculator.py'),'from calculator import total\nassert total([11, 17]) == 28\nassert total([]) == 0\n');
 const repair=await turn(thread,'Run python3 test_calculator.py, inspect the failure, fix calculator.py, and rerun the test. Do not edit test_calculator.py. Use Codex tools for all work.');
 const verified=spawnSync('python3',['test_calculator.py'],{cwd:work});
 record('repair',repair,{testPassed:verified.status===0,testUnchanged:fs.readFileSync(path.join(work,'test_calculator.py'),'utf8')==='from calculator import total\nassert total([11, 17]) == 28\nassert total([]) == 0\n'});
 }
 if (!process.argv.includes('--repair-only') && !process.argv.includes('--lifecycle-only')) {
 const deniedThread=await startThread(true);const before=approvalCount;
 record('denial',await turn(deniedThread,'Use exec_command to run a Python command writing DENIED_SENTINEL into denied.txt here. If permission is denied, stop and report denial; do not try another command or tool.'),{approvalWasDenied:approvalCount>before,fileAbsent:!fs.existsSync(path.join(work,'denied.txt'))});
 }
 if (!process.argv.includes('--repair-only')) {
  const cancellationThread=await startThread();
  const start=events.length;
  const {turn:activeTurn}=await rpc('turn/start',{threadId:cancellationThread,input:[{type:'text',text:'Use exec_command to read input.json and explain the calculation.'}]});
  const activeDeadline=Date.now()+10000;
  while(!runtime.backend.busy&&Date.now()<activeDeadline)await new Promise(r=>setTimeout(r,20));
  const reachedBackend=runtime.backend.busy===true;
  await rpc('turn/interrupt',{threadId:cancellationThread,turnId:activeTurn.id});
  const cleanupDeadline=Date.now()+10000;
  while((runtime.backend.busy||!events.slice(start).some(e=>e.method==='turn/completed'))&&Date.now()<cleanupDeadline)await new Promise(r=>setTimeout(r,50));
  const interrupted=events.slice(start).find(e=>e.method==='turn/completed');
  const cancelChecks={reachedBackend,interrupted:interrupted?.params.turn.status==='interrupted',backendReleased:!runtime.backend.busy,manifestRemoved:!fs.existsSync(path.join(runtime.backend.directory,'bridge-request.json'))};
  record('cancel',{status:'completed'},cancelChecks);
  const oldTimeout=config.timeoutMs;config.timeoutMs=100;
  const response=await fetch(`http://127.0.0.1:${config.port}/v1/responses`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({model:overrides.model,input:'Describe a small arithmetic proof.',stream:false})});
  const failure=await response.json();config.timeoutMs=oldTimeout;
  record('timeout',{status:'completed'},{deadlineReported:response.status===504&&failure.error?.code==='request_cancelled',backendReleased:!runtime.backend.busy});
  const recoveryThread=await startThread();
  record('recovery',await turn(recoveryThread,'Reply with exactly RECOVERED. No tools needed.'),{backendReleased:!runtime.backend.busy});
 }
 receipt.passed=receipt.scenarios.every(s=>s.passed);
}catch(error){receipt.error=error.message.replaceAll(root,'<temporary-workspace>');receipt.passed=false;}
finally{
 if(child)child.kill('SIGTERM');if(bridge)await bridge.close();if(runtime)await runtime.stop();
 receipt.sourceChangedDuringRun=receipt.sourceSha256!==sourceDigest();
 if(receipt.sourceChangedDuringRun)receipt.passed=false;
 // No prompts, raw model output, credentials or machine paths in the receipt.
 const destination=path.resolve(process.env.BRIDGE_RECEIPT||'generated/native-acceptance.json');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(receipt,null,2)+'\n');
 if(receipt.error)console.error(receipt.error);
 if(process.env.BRIDGE_DEBUG_STDERR){const diagnostic=path.join(root,'stderr');fs.writeFileSync(diagnostic,stderr,{mode:0o600});console.error('Debug stderr retained in temporary workspace: '+root);}else fs.rmSync(root,{recursive:true,force:true});
 console.log(JSON.stringify({receipt:destination,passed:receipt.passed}));if(!receipt.passed)process.exitCode=1;
}
