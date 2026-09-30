// Opt-in real launchd lifecycle with isolated Router/Codex state. No inference.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(!process.env.BRIDGE_LIFECYCLE_CHILD){
 if(process.argv[2]!=='--live'||!process.argv[3])throw Error('Usage: node scripts/desktop-lifecycle-check.mjs --live ROUTER_DIR');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-desktop-lifecycle-'));
 const result=spawnSync(process.execPath,[process.argv[1],path.resolve(process.argv[3])],{env:{...process.env,BRIDGE_LIFECYCLE_CHILD:'1',BRIDGE_LIFECYCLE_ROOT:root,CODEX_HOME:path.join(root,'codex'),MODEL_ROUTER_STATE_DIR:path.join(root,'state'),MODEL_ROUTER_USER_MODELS:path.join(root,'state/user-models.json'),CODEX_ROUTER_NO_DISCOVERY:'0'},encoding:'utf8',timeout:240000});
 console.log(result.stdout);console.error(result.stderr.slice(-1500));
 if(result.status===0)fs.rmSync(root,{recursive:true,force:true});
 process.exit(result.status??1);
}
const {installDesktop,uninstallDesktop,checkBridge}=await import('../src/desktop-install.mjs');
const {installRuntime}=await import('../src/runtime-install.mjs');
const {ensureRouter}=await import('../src/router-install.mjs');
const {prepareDirectory,preparedEnvironment}=await import('../src/setup.mjs');
const {installService,removeService,availablePort}=await import('../src/service.mjs');
const {prepareRouterPlan}=await import('../src/router-plan.mjs');
const {loadRouter,registerRouter,unregisterRouter}=await import('../src/router-registration.mjs');
const net=await import('node:net');
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const routerRoot=process.argv[2],root=process.env.BRIDGE_LIFECYCLE_ROOT,api=await loadRouter(routerRoot),state=api.paths.STATE_DIR;
fs.mkdirSync(state,{recursive:true});fs.mkdirSync(process.env.CODEX_HOME,{recursive:true});
fs.writeFileSync(path.join(state,'generic-providers.json'),JSON.stringify({version:1,providers:[]}));api.users.writeUserModels([]);
fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify({models:[]}));
const native=JSON.parse(fs.readFileSync('examples/native-models.json'));native.models=[{...native.models[0],slug:'gpt-native-sentinel',display_name:'Native sentinel'}];
const source=path.join(root,'user-catalog.json');fs.writeFileSync(source,JSON.stringify(native));
fs.writeFileSync(api.paths.NATIVE_CATALOG_SOURCE_PATH,JSON.stringify({version:1,path:source,status:'active'}));
fs.writeFileSync(path.join(state,'native-models.json'),JSON.stringify(native));
const deps={ensureRouter,installRuntime,prepareDirectory,preparedEnvironment,installService,removeService,prepareRouterPlan,loadRouter,freePort,checkBridge,
 registerRouter:(dir,opts)=>registerRouter(dir,{...opts,restart:false}),
 unregisterRouter:(dir,opts)=>unregisterRouter(dir,{...opts,restart:false})};
const options={directory:path.join(root,'installation'),routerRoot};
const prepared=path.join(options.directory,'prepared');
const receipt={date:new Date().toISOString(),isolatedClientState:true,realLaunchd:true,realPublication:true,routerServiceRestart:false,modelRequests:0,checks:{}};
const catalogSlugs=()=>JSON.parse(fs.readFileSync(path.join(state,'merged-models.json'))).models.map(x=>x.slug);
const stopped=async()=>{
 if(!fs.existsSync(prepared))return;
 const env=preparedEnvironment(prepared,{});
 for(let i=0;i<50;i++){
  try{await availablePort(Number(env.BRIDGE_PORT));await availablePort(Number(env.OPENCODE_PORT));return;}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 throw Error('Test service ports remained occupied after removal.');
};
try{
 const first=await installDesktop(options,deps);assert.equal(first.installed,true);
 assert.ok(catalogSlugs().includes('opencode-native-bridge/opencode/big-pickle'));assert.ok(catalogSlugs().includes('opencode-native-bridge/opencode/muse-spark-1.3-contributor-free'));
 receipt.checks.installHealthyAndPublished=true;
 const tokenPath=path.join(prepared,'state/local-token'),tokenHash=createHash('sha256').update(fs.readFileSync(tokenPath)).digest('hex');
 assert.equal((await installDesktop(options,deps)).reused,true);receipt.checks.repeat=true;
 await uninstallDesktop(options,deps);await stopped();assert.ok(!catalogSlugs().includes('opencode-native-bridge/opencode/big-pickle'));receipt.checks.uninstall=true;
 assert.equal((await installDesktop(options,deps)).resumed,true);receipt.checks.reinstall=true;
 await uninstallDesktop(options,deps);await stopped();
 let once=true;const failing={...deps,checkBridge:async dir=>{await checkBridge(dir);if(once){once=false;throw Error('Injected after-health failure');}}};
 await assert.rejects(installDesktop(options,failing),/Injected after-health/);await stopped();
 assert.equal((await installDesktop(options,deps)).resumed,true);receipt.checks.healthFailureResume=true;
 assert.equal(createHash('sha256').update(fs.readFileSync(tokenPath)).digest('hex'),tokenHash);receipt.checks.tokenPreserved=true;
 assert.equal(fs.readFileSync(source,'utf8'),JSON.stringify(native));receipt.checks.nativeSourcePreserved=true;
 receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-workspace>');process.exitCode=1;}
finally{
 try{await uninstallDesktop(options,deps);await stopped();receipt.cleanup=true;}catch{receipt.cleanup=false;receipt.passed=false;process.exitCode=1;}
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/desktop-lifecycle-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
