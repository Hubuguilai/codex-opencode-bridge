// Opt-in real launchd lifecycle with isolated Router/Codex state. No inference.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isolatedRouterEnvironment,startIsolatedRouter} from './isolated-router.mjs';
if(!process.env.BRIDGE_LIFECYCLE_CHILD){
 if(process.argv[2]!=='--live'||!process.argv[3])throw Error('Usage: node scripts/desktop-lifecycle-check.mjs --live ROUTER_DIR');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-desktop-lifecycle-'));
 const routeEnv=process.env.BRIDGE_VERIFY_ROUTER==='1'?await isolatedRouterEnvironment():{};
 const result=spawnSync(process.execPath,[process.argv[1],path.resolve(process.argv[3])],{env:{...process.env,...routeEnv,BRIDGE_LIFECYCLE_CHILD:'1',BRIDGE_LIFECYCLE_ROOT:root,CODEX_HOME:path.join(root,'codex'),MODEL_ROUTER_STATE_DIR:path.join(root,'state'),MODEL_ROUTER_USER_MODELS:path.join(root,'state/user-models.json'),CODEX_ROUTER_NO_DISCOVERY:'0'},encoding:'utf8',timeout:1500000});
 console.log(result.stdout);console.error(result.stderr.slice(-1500));
 if(result.status===0)fs.rmSync(root,{recursive:true,force:true});
 process.exit(result.status??1);
}
const {installDesktop,uninstallDesktop,checkBridge}=await import('../src/desktop-install.mjs');
const {verifyInstalled}=await import('../src/installed-verification.mjs');
const {verifyClientRoute}=await import('../src/client-verification.mjs');
const {setDesktopModels,recoverDesktopModels}=await import('../src/desktop-models.mjs');
const {updateRouterModels}=await import('../src/router-registration.mjs');
const {upgradeDesktop,recoverDesktopUpgrade}=await import('../src/desktop-upgrade.mjs');
const {stageRelease,verifyRelease}=await import('../src/releases.mjs');
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
 if(process.env.BRIDGE_VERIFY_ROUTER==='1'){
  receipt.modelRequests='live_router_client_verification';
  const stack=await startIsolatedRouter({routerRoot,api});
  let report;
  const verificationDeps=process.env.BRIDGE_SYNTHETIC_DIAGNOSTICS==='1'?{verifyClientRoute:args=>verifyClientRoute({...args,imageTrials:Number(process.env.BRIDGE_IMAGE_TRIALS||1),onSyntheticImageResult:result=>fs.appendFileSync('generated/synthetic-image-answers.jsonl',JSON.stringify(result)+'\n',{mode:0o600})})}:{};
  try{report=await verifyInstalled({directory:options.directory,live:true,onProgress:event=>console.log(JSON.stringify(event))},verificationDeps);report={...report,receipt:undefined,actualPublishedGatewayConfig:true,pinnedRouterWithRecordedCompatibility:true};}
  finally{await stack.stop();if(report)fs.writeFileSync('generated/router-client-verification.json',JSON.stringify(report,null,2)+'\n');}
  assert.equal(report.passed,true);receipt.checks.realRouterClientVerification=true;
 }

 if(process.env.BRIDGE_VERIFY_INSTALLED==='1'){receipt.modelRequests='live_client_verification';const verified=await verifyInstalled({directory:options.directory,live:true,route:'bridge',onProgress:event=>console.log(JSON.stringify(event))});fs.writeFileSync('generated/installed-client-verification.json',JSON.stringify({...verified,receipt:undefined},null,2)+'\n');assert.equal(verified.passed,true);receipt.modelRequests='live_client_verification';receipt.checks.installedClientVerification=true;}
 const installed=JSON.parse(fs.readFileSync(path.join(options.directory,'desktop-install.json')));
 const code=verifyRelease(installed.release);
 const serviceId=createHash('sha256').update(prepared).digest('hex').slice(0,16);
 const service=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/codex-opencode-bridge/services',serviceId,'service.json')));
 assert.equal(service.cli,code.cli);assert.notEqual(service.cli,path.resolve('bin/bridge.mjs'));
 receipt.checks.independentCodeRelease=true;receipt.codeReleaseSha256=code.id;
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
 // Real service version switch: candidate differs only by a harmless source marker.
 const current=JSON.parse(fs.readFileSync(path.join(options.directory,'desktop-install.json')));
 const candidate=path.join(root,'candidate');fs.cpSync(current.release,candidate,{recursive:true});
 fs.appendFileSync(path.join(candidate,'src/config.mjs'),'\n// lifecycle upgrade candidate\n');
 const upgradeDeps={stageRelease:base=>stageRelease(base,{source:candidate})};
 assert.equal((await upgradeDesktop(options,upgradeDeps)).upgraded,true);
 const newer=JSON.parse(fs.readFileSync(path.join(options.directory,'desktop-install.json')));
 assert.notEqual(newer.release,current.release);await checkBridge(prepared);receipt.checks.upgrade=true;
 assert.equal((await upgradeDesktop({...options,rollback:true})).rolledBack,true);await checkBridge(prepared);
 assert.equal(JSON.parse(fs.readFileSync(path.join(options.directory,'desktop-install.json'))).release,current.release);receipt.checks.rollback=true;
 const beforeFailure=fs.readFileSync(path.join(options.directory,'desktop-install.json'),'utf8');
 let failOnce=true;
 await assert.rejects(upgradeDesktop(options,{...upgradeDeps,checkBridge:async dir=>{await checkBridge(dir);if(failOnce){failOnce=false;throw Error('Injected upgrade health failure');}}}),/previous version was restored/);
 assert.equal(fs.readFileSync(path.join(options.directory,'desktop-install.json'),'utf8'),beforeFailure);await checkBridge(prepared);receipt.checks.failedUpgradeRestored=true;
 await assert.rejects(upgradeDesktop(options,{...upgradeDeps,checkBridge:async dir=>{await checkBridge(dir);throw Error('Injected recovery health failure');}}),/recover-upgrade/);
 assert.equal((await recoverDesktopUpgrade(options)).restored,true);await checkBridge(prepared);
 assert.equal(fs.readFileSync(path.join(options.directory,'desktop-install.json'),'utf8'),beforeFailure);receipt.checks.explicitUpgradeRecovery=true;
 assert.equal(createHash('sha256').update(fs.readFileSync(tokenPath)).digest('hex'),tokenHash);
 assert.equal(fs.readFileSync(source,'utf8'),JSON.stringify(native));receipt.checks.upgradeConfigurationPreserved=true;
 const modelDeps={updateRouterModels:(dir,opts)=>updateRouterModels(dir,{...opts,restart:false})};
 const installedList=async()=>{const env=preparedEnvironment(prepared,{}),token=fs.readFileSync(tokenPath,'utf8').trim();const response=await fetch(`http://127.0.0.1:${env.BRIDGE_PORT}/v1/models`,{headers:{authorization:'Bearer '+token}});assert.equal(response.status,200);return (await response.json()).data.map(x=>x.id);};
 assert.equal((await setDesktopModels({...options,models:['opencode/big-pickle']},modelDeps)).updated,true);
 assert.deepEqual(await installedList(),['opencode/big-pickle']);assert.ok(!catalogSlugs().includes('opencode-native-bridge/opencode/muse-spark-1.3-contributor-free'));receipt.checks.modelRemove=true;
 assert.equal((await installDesktop(options,deps)).reused,true);assert.deepEqual(await installedList(),['opencode/big-pickle']);receipt.checks.repeatRetainsSelection=true;
 const both=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'];
 await setDesktopModels({...options,models:both},modelDeps);assert.deepEqual(await installedList(),both);assert.ok(catalogSlugs().includes('opencode-native-bridge/opencode/muse-spark-1.3-contributor-free'));receipt.checks.modelAdd=true;
 const beforeModels=fs.readFileSync(path.join(options.directory,'desktop-install.json'),'utf8');let modelFail=true;
 await assert.rejects(setDesktopModels({...options,models:['opencode/big-pickle']},{...modelDeps,checkBridge:async dir=>{await checkBridge(dir);if(modelFail){modelFail=false;throw Error('Injected model startup check failure');}}}),/previous configuration/);
 assert.deepEqual(await installedList(),both);assert.equal(fs.readFileSync(path.join(options.directory,'desktop-install.json'),'utf8'),beforeModels);receipt.checks.modelFailureRestore=true;
 let failPublished=true;
 await assert.rejects(setDesktopModels({...options,models:['opencode/big-pickle']},{...modelDeps,updateRouterModels:async(dir,opts)=>{await updateRouterModels(dir,{...opts,restart:false});if(failPublished){failPublished=false;throw Error('Injected after-publication failure');}}}),/previous configuration/);
 assert.deepEqual(await installedList(),both);assert.ok(catalogSlugs().includes('opencode-native-bridge/opencode/muse-spark-1.3-contributor-free'));receipt.checks.postPublicationModelRestore=true;
 await assert.rejects(setDesktopModels({...options,models:['opencode/big-pickle']},{...modelDeps,checkBridge:async()=>{throw Error('Injected model recovery failure');}}),/recover-models/);
 assert.equal((await recoverDesktopModels(options,modelDeps)).restored,true);assert.deepEqual(await installedList(),both);receipt.checks.modelExplicitRecovery=true;
 assert.equal(createHash('sha256').update(fs.readFileSync(tokenPath)).digest('hex'),tokenHash);assert.equal(fs.readFileSync(source,'utf8'),JSON.stringify(native));receipt.checks.modelConfigurationPreserved=true;
 receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-workspace>');if(error.errors)receipt.causes=error.errors.map(x=>x.message.replaceAll(root,'<temporary-workspace>')); process.exitCode=1;}
finally{
 try{await uninstallDesktop(options,deps);await stopped();receipt.cleanup=true;}catch{receipt.cleanup=false;receipt.passed=false;process.exitCode=1;}
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/desktop-lifecycle-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
