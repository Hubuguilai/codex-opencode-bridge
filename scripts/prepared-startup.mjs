// Exercise the real packaged command and installed runtime, without model requests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {prepareDirectory,removePreparedDirectory} from '../src/setup.mjs';
if(!process.argv.includes('--live-runtime'))throw new Error('Starting the installed runtime requires --live-runtime. No model generations are sent.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-prepared-acceptance-'));
const directory=path.join(root,'prepared'),port=Number(process.env.BRIDGE_TEST_PORT||5096),upstreamPort=Number(process.env.OPENCODE_TEST_PORT||5097);
const models=['opencode/space-bunny-free','opencode/nemotron-3-ultra-free','opencode/mimo-v2.6-flash-free','opencode/longcat-2.5-preview-free','opencode/big-pickle'];
const hash=createHash('sha256');
for(const folder of ['src','bin'])for(const name of fs.readdirSync(new URL('../'+folder+'/',import.meta.url)).filter(x=>x.endsWith('.mjs')).sort()){hash.update(folder+'/'+name);hash.update(fs.readFileSync(new URL('../'+folder+'/'+name,import.meta.url)));}
const receipt={date:new Date().toISOString(),sourceAndCliSha256:hash.digest('hex'),models,modelGenerations:0,checks:{}};
let child;
function launch(){
 const processChild=spawn(process.execPath,[fileURLToPath(new URL('../bin/bridge.mjs',import.meta.url)),'serve-prepared',directory],{env:{...process.env,BRIDGE_TOKEN:'inherited-token-must-not-be-used',BRIDGE_MODE:'text',BRIDGE_MODELS:'incorrect/model',BRIDGE_PORT:'1',OPENCODE_PORT:'2'},stdio:['ignore','pipe','pipe']});
 let output='';processChild.stdout.on('data',data=>{output+=data;});processChild.stderr.on('data',()=>{});
 const exited=new Promise(resolve=>processChild.once('exit',(code,signal)=>resolve({code,signal})));
 return {process:processChild,exited,ready:()=>output.includes('Bridge ready at')};
}
async function stop(handle){if(handle.process.exitCode===null&&handle.process.signalCode===null)handle.process.kill('SIGTERM');await Promise.race([handle.exited,new Promise((_,reject)=>{const timer=setTimeout(()=>{handle.process.kill('SIGKILL');reject(new Error('Prepared service did not stop cleanly'));},10000);timer.unref();})]);}
const get=route=>fetch(`http://127.0.0.1:${port}${route}`,{signal:AbortSignal.timeout(2000)});
try{
 const result=prepareDirectory(directory,{models,port,upstreamPort});const token=fs.readFileSync(result.tokenPath,'utf8');
 for(let cycle=0;cycle<2;cycle++){
  child=launch();const deadline=Date.now()+25000;
  while(!child.ready()&&Date.now()<deadline){if(child.process.exitCode!==null)throw new Error('Prepared service exited before readiness');await new Promise(r=>setTimeout(r,100));}
  assert.ok(child.ready(),'Prepared service readiness deadline');
  const health=await (await get('/health')).json();assert.equal(health.ok,true);assert.equal(health.mode,'native-tools');receipt.opencode=health.upstream.version;
  assert.equal((await get('/v1/models')).status,401);
  const inherited=await fetch(`http://127.0.0.1:${port}/v1/models`,{headers:{authorization:'Bearer inherited-token-must-not-be-used'},signal:AbortSignal.timeout(2000)});assert.equal(inherited.status,401);
  const listing=await fetch(`http://127.0.0.1:${port}/v1/models`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(2000)});assert.equal(listing.status,200);assert.deepEqual((await listing.json()).data.map(x=>x.id),models);
  assert.throws(()=>removePreparedDirectory(directory),/stop the managed service/);
  if(cycle===0){const conflict=launch();try{const failure=await Promise.race([conflict.exited,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Second instance did not fail')),25000);t.unref();})]);assert.notEqual(failure.code,0);assert.equal((await (await get('/health')).json()).ok,true);receipt.checks.secondInstancePreservesFirst=true;}finally{await stop(conflict);}}
  await stop(child);child=null;
  assert.deepEqual(fs.readdirSync(path.join(directory,'state')),['local-token']);assert.equal(fs.readFileSync(result.tokenPath,'utf8'),token);
  receipt.checks['cycle'+(cycle+1)]=true;
 }
 removePreparedDirectory(directory);assert.equal(fs.existsSync(directory),false);receipt.checks.removedAfterStop=true;receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-workspace>');process.exitCode=1;}
finally{
 if(child)await stop(child).catch(()=>{});fs.rmSync(root,{recursive:true,force:true});
 const destination=process.env.BRIDGE_RECEIPT||'generated/prepared-startup.json';fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}
