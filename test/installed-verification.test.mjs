import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {verifyClientRoute,classifyVerificationError,finalClientText} from '../src/client-verification.mjs';
import {verificationImage} from '../src/verification-image.mjs';
import {verifyInstalled} from '../src/installed-verification.mjs';
import {prepareDirectory} from '../src/setup.mjs';import {stageRelease} from '../src/releases.mjs';
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'verify-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function mockClient(t,{deny=false}={}){
 const file=path.join(root(t),'codex');
 fs.writeFileSync(file,`#!${process.execPath}\nimport fs from 'node:fs';import {createInterface} from 'node:readline';const send=x=>console.log(JSON.stringify(x));createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(!m.id)return;if(m.method==='initialize')return send({id:m.id,result:{}});if(m.method==='thread/start')return send({id:m.id,result:{thread:{id:'thread'}}});if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'turn'}}});if(${deny})return send({method:'turn/completed',params:{turn:{id:'turn',status:'failed',error:{message:'HTTP 401 PRIVATE_TOKEN'}}}});const prompt=m.params.input[0].text;let text='000000';if(prompt.startsWith('Reply with exactly '))text=prompt.slice(19).split('.')[0];else if(prompt.includes('input.json')){const data=JSON.parse(fs.readFileSync('input.json'));fs.writeFileSync('output.json',JSON.stringify({marker:data.marker,sum:data.values.reduce((a,b)=>a+b,0)}));send({method:'item/completed',params:{item:{type:'commandExecution'}}});text='Done';}send({method:'item/completed',params:{item:{type:'agentMessage',text}}});send({method:'turn/completed',params:{turn:{id:'turn',status:'completed'}}});}});`,{mode:0o700});return file;
}
test('Verification checks real client outcomes rather than accepting a completed turn',async t=>{
 const result=await verifyClientRoute({model:'model',baseUrl:'http://127.0.0.1:1/v1',token:'PRIVATE_TOKEN',catalogEntry:{slug:'model'},codex:mockClient(t),images:true});
 assert.deepEqual(result.checks.map(x=>[x.name,x.passed]),[['text',true],['client_file_tools',true],['uploaded_image',false]]);assert.equal(result.passed,false);assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));
});
test('Client errors are categorized without publishing provider payloads',async t=>{
 const result=await verifyClientRoute({model:'model',baseUrl:'http://127.0.0.1:1/v1',token:'PRIVATE_TOKEN',catalogEntry:{slug:'model'},codex:mockClient(t,{deny:true})});
 assert.equal(result.errorCategory,'authentication');assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));
 assert.equal(classifyVerificationError('stream closed before response.completed'),'stream_interrupted');
});
test('Local busy/auth, provider denial, context and byte limits stay distinct',()=>{
 const cases=[
  ['HTTP 429 bridge_busy','bridge_busy'],['OpenCode runtime is busy.','bridge_busy'],
  ['OpenCode returned HTTP 401.','runtime_configuration'],['A valid local bridge Bearer token is required.','local_authentication'],
  ['HTTP 403: access was rejected; this does not establish quota exhaustion.','model_access'],
  ['HTTP 429: rate or quota limit','rate_limit'],['context_length_exceeded','context_limit'],
  ['Request exceeds the byte limit; nothing was truncated.','input_size'],['upstream_tool_schema','tool_parameters'],
  ['generation_failed: do not assume quota exhaustion','generation_failed'],['output_limit_exceeded','output_limit'],
 ];for(const [message,category]of cases)assert.equal(classifyVerificationError(message),category);
});
test('Visual challenge is a metadata-free PNG and rejects non-digit challenges',()=>{
 const png=verificationImage('123456');assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(!png.includes(Buffer.from('123456')));assert.throws(()=>verificationImage('abc'),/digits/);
});
for(const category of ['model_access','bridge_busy','runtime_configuration'])test(`Installed verification requires opt-in and stops after ${category}`,async t=>{
 await assert.rejects(verifyInstalled({directory:'/does-not-exist'}),/verify --live/);
 const directory=root(t),prepared=path.join(directory,'prepared'),models=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'];prepareDirectory(prepared,{models});
 const code=stageRelease(path.join(directory,'releases'));fs.writeFileSync(path.join(directory,'desktop-install.json'),JSON.stringify({kind:'bridge-desktop-install',status:'installed',prepared,plan:path.join(directory,'router-plan'),routerRoot:path.join(directory,'router'),release:code.directory,models}));
 let count=0;const result=await verifyInstalled({directory,live:true,route:'bridge'},{checkBridge:async()=>{},checkIdle:async()=>{},verifyClientRoute:async({model})=>{count++;return {model,passed:false,errorCategory:category};}});
 assert.equal(count,1);assert.equal(result.passed,false);assert.equal(result.stopReason,category);assert.equal(result.stoppedEarly,true);assert.deepEqual(result.skippedModels,[models[1]]);assert.equal(fs.statSync(result.receipt).mode&0o777,0o600);assert.equal(result.routerForwardingVerified,false);
 assert.ok(!fs.existsSync(path.join(directory,'.installation-lock')));
});

test('Verification reads the final answer rather than concatenating commentary into it',()=>{
 assert.equal(finalClientText([{type:'agentMessage',phase:'commentary',text:'Checking image'},{type:'agentMessage',phase:'final_answer',text:'123456'}]),'123456');
 assert.equal(finalClientText([{type:'agentMessage',text:'123456'}]),'123456');
 assert.equal(finalClientText([{type:'agentMessage',phase:'commentary',text:'123456'}]),'');
});
test('Default installed verification follows Router while retaining declared native capabilities',async t=>{
 const directory=root(t),prepared=path.join(directory,'prepared'),models=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'];prepareDirectory(prepared,{models});
 const code=stageRelease(path.join(directory,'releases'));fs.writeFileSync(path.join(directory,'desktop-install.json'),JSON.stringify({kind:'bridge-desktop-install',status:'installed',prepared,plan:path.join(directory,'router-plan'),routerRoot:path.join(directory,'router'),release:code.directory,models}));
 const calls=[];
 const result=await verifyInstalled({directory,live:true},{checkBridge:async()=>{},checkIdle:async()=>{},routerVerificationRoute:async()=>({name:'test_router',baseUrl:'http://127.0.0.1:1234/v1',token:'LOCAL_SECRET',models:models.map((id,index)=>({id,model:'registered/'+id,entry:{slug:'registered/'+id,input_modalities:['text','image']},images:index===1,routerAdvertisesImages:true}))}),verifyClientRoute:async options=>{calls.push(options);return {model:options.model,passed:true};}});
 assert.equal(result.routerForwardingVerified,true);assert.deepEqual(calls.map(x=>x.images),[false,true]);assert.ok(calls.every(x=>x.baseUrl==='http://127.0.0.1:1234/v1'&&x.route==='test_router'));
 assert.equal(result.models[0].routerAddsImageCapability,true);assert.ok(!JSON.stringify(result).includes('LOCAL_SECRET'));
});
