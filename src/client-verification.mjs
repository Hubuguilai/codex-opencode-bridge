import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {randomUUID,randomInt} from 'node:crypto';
import {verificationImage} from './verification-image.mjs';
export function finalClientText(items){
 const messages=items.filter(x=>x.type==='agentMessage');
 return (messages.filter(x=>x.phase==='final_answer').at(-1)??messages.filter(x=>x.phase!=='commentary').at(-1))?.text??'';
}
export function verifiedToolImage(result,file,code){
 return result.text.trim()===code&&result.tools===0&&result.imagePaths?.includes(file);
}
export function classifyVerificationError(message=''){
 if(/Verification assertion/.test(message))return 'verification_assertion';
 if(/bridge_busy|local bridge concurrency limit|OpenCode runtime is busy/i.test(message))return 'bridge_busy';
 if(/opencode_http_error|OpenCode returned HTTP|relay_plugin_unavailable|unsupported_opencode_version/i.test(message))return 'runtime_configuration';
 if(/valid local bridge Bearer token|local bridge.*unauthorized/i.test(message))return 'local_authentication';
 if(/output_limit_exceeded|provider stopped at its output limit/i.test(message))return 'output_limit';
 if(/context_length_exceeded|provider explicitly reported.*context limit/i.test(message))return 'context_limit';
 if(/input_too_large|configured byte limit|request exceeds the byte limit/i.test(message))return 'input_size';
 if(/upstream_tool_schema|invalid_tool_arguments|provider rejected the supplied tool schema/i.test(message))return 'tool_parameters';
 if(/generation_failed|OpenCode generation failed|without a recognized safe error category/i.test(message))return 'generation_failed';
 if(/403|access denied|permission.*model/i.test(message))return 'model_access';
 if(/401|authentication/i.test(message))return 'authentication';
 if(/429|quota|rate.?limit/i.test(message))return 'rate_limit';
 if(/unsupported|not supported|schema|invalid.*tool/i.test(message))return 'unsupported_input_or_tool';
 if(/timeout|deadline/i.test(message))return 'timeout';
 if(/stream.*closed|disconnected|response.completed|event_stream_gap|non_append_output/i.test(message))return 'stream_interrupted';
 return 'client_or_service_error';
}
export async function verifyClientRoute({model,baseUrl,token,catalogEntry,images=false,imageTrials=1,diagnosticImageOnly=false,timeoutMs=300000,route='installed_bridge_direct_real_codex_client',onProgress=()=>{},onSyntheticImageResult=()=>{},onPrivateError=()=>{},codex='codex'}){
 if(diagnosticImageOnly&&!images)throw Error('Image-only diagnostics require an image-capable route.');
 if(!Number.isInteger(imageTrials)||imageTrials<1||imageTrials>5)throw Error('Image verification trials must be between one and five.');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-client-verify-')),work=path.join(root,'workspace');fs.mkdirSync(work);
 const catalog=path.join(root,'catalog.json');fs.writeFileSync(catalog,JSON.stringify({models:[catalogEntry]}),{mode:0o600});
 const config={model_provider:'installed_bridge_check',model,model_catalog_json:catalog,
 'model_providers.installed_bridge_check.name':'Installed bridge verification','model_providers.installed_bridge_check.base_url':baseUrl,
 'model_providers.installed_bridge_check.wire_api':'responses','model_providers.installed_bridge_check.env_key':'BRIDGE_VERIFY_TOKEN',
 'model_providers.installed_bridge_check.requires_openai_auth':false,'model_providers.installed_bridge_check.request_max_retries':0,'model_providers.installed_bridge_check.stream_max_retries':0,
 model_reasoning_effort:'default',model_reasoning_summary:'none',web_search:'disabled','features.apps':false,'features.multi_agent':false,'features.memories':false};
 const receipt={model,route,checks:[],desktopPickerVerified:false,...(diagnosticImageOnly?{diagnosticOnly:true,omittedChecks:['text','client_file_tools']}: {})};
 let child,sequence=0,exited=false;const pending=new Map(),events=[];
 const send=x=>child.stdin.write(JSON.stringify(x)+'\n');
 const rpc=(method,params)=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Client RPC timeout'));},20000);
  pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:x=>{clearTimeout(timer);reject(x);}});send({id,method,params});
 });
 async function turn(threadId,input){
  const from=events.length,start=Date.now(),{turn}=await rpc('turn/start',{threadId,input});
  while(Date.now()-start<timeoutMs){
   if(exited)throw Error('Codex client exited');
   const seen=events.slice(from),end=seen.find(x=>x.method==='turn/completed'&&x.params.turn.id===turn.id);
   if(end){
    if(end.params.turn.status!=='completed')throw Error(end.params.turn.error?.message||'Client turn failed');
    const items=seen.filter(x=>x.method==='item/completed').map(x=>x.params.item);
    return {text:finalClientText(items),agentMessages:items.filter(x=>x.type==='agentMessage').length,tools:items.filter(x=>['commandExecution','fileChange'].includes(x.type)).length,imagePaths:items.filter(x=>x.type==='imageView').map(x=>x.path),durationMs:Date.now()-start};
   }
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  await rpc('turn/interrupt',{threadId,turnId:turn.id});throw Error('Client turn deadline exceeded');
 }
 const record=(name,result,passed)=>{receipt.checks.push({name,passed,durationMs:result.durationMs,clientToolEvents:result.tools,imageToolEvents:result.imagePaths?.length??0});onProgress({model,check:name,passed});if(!passed)throw Error('Verification assertion failed');};
 try{
  child=spawn(codex,['app-server','--stdio',...Object.entries(config).flatMap(([key,value])=>['-c',key+'='+JSON.stringify(value)])],{cwd:work,env:{...process.env,BRIDGE_VERIFY_TOKEN:token},stdio:['pipe','pipe','pipe']});
  child.stdin.on('error',()=>{});
  child.stderr.resume();child.on('error',()=>{exited=true;for(const p of pending.values())p.reject(Error('Codex client could not start'));pending.clear();});
  child.on('exit',()=>{exited=true;for(const p of pending.values())p.reject(Error('Codex client exited'));pending.clear();});
  createInterface({input:child.stdout}).on('line',line=>{
   let message;try{message=JSON.parse(line);}catch{return;}
   if(message.id!==undefined&&message.method){
    if(message.method.endsWith('/requestApproval'))send({id:message.id,result:{decision:'decline'}});
    else send({id:message.id,error:{code:-32601,message:'Verification client does not support this request'}});
   }else if(message.id!==undefined){const waiter=pending.get(message.id);pending.delete(message.id);if(waiter)message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);}
   else events.push(message);
  });
  await rpc('initialize',{clientInfo:{name:'bridge_installed_verification',version:'0.2.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
  const {thread}=await rpc('thread/start',{cwd:work,model,modelProvider:'installed_bridge_check',ephemeral:true,approvalPolicy:'on-request',sandbox:'workspace-write',baseInstructions:'Use supplied Codex tools only for requested tasks. Do not use subagents. Respect permission denials.',config});
  let result;
  if(!diagnosticImageOnly){
  receipt.activeCheck='text';const marker=randomUUID();result=await turn(thread.id,[{type:'text',text:'Reply with exactly '+marker+'. No tools.'}]);record('text',result,result.text.trim()===marker);
  const secret=randomUUID(),a=randomInt(100,500),b=randomInt(500,900);fs.writeFileSync(path.join(work,'input.json'),JSON.stringify({marker:secret,values:[a,b]}));
  receipt.activeCheck='client_file_tools';result=await turn(thread.id,[{type:'text',text:'Use Codex tools to read input.json in the workspace. Create output.json containing its exact marker and sum of values, as JSON with keys marker and sum. Verify the file using a tool. Do not read other directories.'}]);
  let output;try{output=JSON.parse(fs.readFileSync(path.join(work,'output.json'),'utf8'));}catch{}
  record('client_file_tools',result,result.tools>0&&output?.marker===secret&&output?.sum===a+b);
  }
  for(let trial=0;images&&trial<imageTrials;trial++){
   const code=String(randomInt(100000,1000000)),file=path.join(root,'challenge.png');fs.writeFileSync(file,verificationImage(code));
   receipt.activeCheck=trial?'uploaded_image_'+(trial+1):'uploaded_image';
   result=await turn(thread.id,[{type:'text',text:'Read the six digits in the attached image. Reply only with those digits. Do not use tools.'},{type:'localImage',path:file}]);
   onSyntheticImageResult({model,trial:trial+1,expected:code,answer:result.text});
   receipt.imageDiagnostics={finalTextLength:result.text.length,agentMessages:result.agentMessages,exactDigitMatch:result.text.trim()===code,containsExpectedDigitGroup:(result.text.match(/\b\d{6}\b/g)||[]).includes(code),sixDigitGroups:(result.text.match(/\b\d{6}\b/g)||[]).length,claimsMissingImage:/cannot|can't|unable|not.*(?:see|view)|no image|无法|看不到|没有.*图/i.test(result.text)};
   record(trial?'uploaded_image_'+(trial+1):'uploaded_image',result,result.tools===0&&result.text.trim()===code);
  }
  if(images){
   const code=String(randomInt(100000,1000000)),file=path.join(work,'tool-challenge.png');
   fs.writeFileSync(file,verificationImage(code));
   receipt.activeCheck='tool_returned_image';
   result=await turn(thread.id,[{type:'text',text:'Use the Codex view_image tool to open '+file+'. Read its six digits and reply only with those digits. Use only view_image for this task; do not run commands, OCR or read the file bytes.'}]);
   onSyntheticImageResult({model,kind:'tool_returned_image',expected:code,answer:result.text});
   record('tool_returned_image',result,verifiedToolImage(result,file,code));
   delete receipt.activeCheck;
  }
  delete receipt.activeCheck;receipt.passed=true;
 }catch(error){onPrivateError({model,check:receipt.activeCheck,message:error.message.replaceAll(token,'<redacted>')});receipt.passed=false;receipt.errorCategory=classifyVerificationError(error.message);onProgress({model,errorCategory:receipt.errorCategory});}
 finally{
  if(child&&!exited){child.kill('SIGTERM');const deadline=Date.now()+3000;while(!exited&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));if(!exited)child.kill('SIGKILL');}
  for(const p of pending.values())p.reject(Error('Verification ended'));pending.clear();
  fs.rmSync(root,{recursive:true,force:true});
 }
 return receipt;
}
