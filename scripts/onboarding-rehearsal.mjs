// Bounded opt-in rehearsal. NOT a clean-machine/Desktop acceptance test.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {isolatedRouterEnvironment,startIsolatedRouter} from './isolated-router.mjs';
if(!process.env.BRIDGE_ONBOARDING_CHILD){
 if(process.argv[2]!=='--live'||!process.argv[3])throw Error('Usage: node scripts/onboarding-rehearsal.mjs --live PINNED_ROUTER');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-onboarding-'));
 const result=spawnSync(process.execPath,[process.argv[1],path.resolve(process.argv[3])],{env:{...process.env,...await isolatedRouterEnvironment(),BRIDGE_ONBOARDING_CHILD:'1',BRIDGE_ONBOARDING_ROOT:root,CODEX_HOME:path.join(root,'codex'),MODEL_ROUTER_STATE_DIR:path.join(root,'router-state'),MODEL_ROUTER_USER_MODELS:path.join(root,'router-state/user-models.json'),CODEX_ROUTER_NO_DISCOVERY:'0'},encoding:'utf8',timeout:600000,maxBuffer:1024*1024});
 console.log(result.stdout);console.error(result.stderr.slice(-1200));
 if(result.status===0)fs.rmSync(root,{recursive:true,force:true});
 process.exit(result.status??1);
}
const {setupForUser}=await import('../src/onboarding.mjs');
const {installDesktop,uninstallDesktop,checkBridge}=await import('../src/desktop-install.mjs');
const {verifyInstalled}=await import('../src/installed-verification.mjs');
const {ensureRouter}=await import('../src/router-install.mjs');
const {installRuntime}=await import('../src/runtime-install.mjs');
const {prepareDirectory,preparedEnvironment}=await import('../src/setup.mjs');
const {installService,removeService}=await import('../src/service.mjs');
const {prepareRouterPlan}=await import('../src/router-plan.mjs');
const {loadRouter,registerRouter,unregisterRouter}=await import('../src/router-registration.mjs');
const net=await import('node:net');
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const routerRoot=process.argv[2],root=process.env.BRIDGE_ONBOARDING_ROOT,directory=path.join(root,'installation');
const api=await loadRouter(routerRoot);fs.mkdirSync(api.paths.STATE_DIR,{recursive:true});fs.mkdirSync(process.env.CODEX_HOME,{recursive:true});
fs.writeFileSync(path.join(api.paths.STATE_DIR,'generic-providers.json'),JSON.stringify({version:1,providers:[]}));api.users.writeUserModels([]);
fs.writeFileSync(api.paths.MERGED_CATALOG_PATH,JSON.stringify({models:[]}));
const native=JSON.parse(fs.readFileSync('examples/native-models.json'));native.models=[{...native.models[0],slug:'gpt-native-sentinel',display_name:'Native sentinel'}];
const source=path.join(root,'native-catalog.json');fs.writeFileSync(source,JSON.stringify(native));
fs.writeFileSync(api.paths.NATIVE_CATALOG_SOURCE_PATH,JSON.stringify({version:1,path:source,status:'active'}));fs.writeFileSync(path.join(api.paths.STATE_DIR,'native-models.json'),JSON.stringify(native));
const deps={ensureRouter,installRuntime,prepareDirectory,preparedEnvironment,installService,removeService,prepareRouterPlan,loadRouter,freePort,checkBridge,registerRouter:(dir,opt)=>registerRouter(dir,{...opt,restart:false}),unregisterRouter:(dir,opt)=>unregisterRouter(dir,{...opt,restart:false})};
let stack;
const receipt={date:new Date().toISOString(),kind:'onboarding-isolated-rehearsal',cleanMachine:false,desktopPickerVerified:false,existingPinnedRouterDependency:true,sharedRouterRestart:false,nativeCatalogFixture:true,realLaunchd:true,realCodex:true};
try{
 const options={live:true,directory,routerRoot,onProgress:x=>console.log(JSON.stringify(x))};
 const result=await setupForUser(options,{run:spawnSync,installDesktop:opts=>installDesktop(opts,deps),verifyInstalled:async opts=>{
  stack=await startIsolatedRouter({routerRoot,api});return verifyInstalled(opts);
 }});
 receipt.first={ready:result.ready,installed:result.installed,models:result.models,checks:result.checks,category:result.category,next:result.next};
 assert.equal(result.ready,true,'Actual Big Pickle onboarding verification failed');
 // Repeat the real installer without spending another model call. Unit tests
 // independently check that setup reruns verification rather than skipping it.
 const repeat=await installDesktop({directory,routerRoot},deps);receipt.repeatReused=repeat.reused;assert.equal(repeat.reused,true);
 await stack.stop();stack=undefined;
 await uninstallDesktop({directory},deps);receipt.removed=true;
}finally{
 if(stack)await stack.stop();
 if(fs.existsSync(path.join(directory,'desktop-install.json'))){try{await uninstallDesktop({directory},deps);}catch{}}
 fs.writeFileSync('generated/onboarding-rehearsal.json',JSON.stringify(receipt,null,2)+'\n');
}
