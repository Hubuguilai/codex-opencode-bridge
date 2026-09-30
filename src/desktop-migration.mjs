import fs from 'node:fs';import {createHash,randomUUID} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');import path from 'node:path';import os from 'node:os';import net from 'node:net';
import {acquireInstallLock,writeInstallState as save} from './install-state.mjs';
import {inspectLegacyService,checkLegacyService,waitLegacyService,retireLegacyService,restoreLegacyService} from './legacy-service.mjs';
import {inspectLegacyRouterRoute,regularToken} from './legacy-router-route.mjs';
import {captureLegacyRouteRecovery,restoreLegacyRouterRoute} from './legacy-route-recovery.mjs';
import {loadRouter,adoptLegacyRouterRoute,verifyRouterSelection} from './router-registration.mjs';
import {prepareRouterPlan} from './router-plan.mjs';import {prepareDirectory,preparedEnvironment} from './setup.mjs';
import {inspectRouterCompatibility} from './router-compatibility.mjs';import {routerMigrationPreflight} from './router-migration-preflight.mjs';import {reconcileRouterSource} from './router-source-reconciliation.mjs';
import {stageRelease,verifyRelease} from './releases.mjs';import {installRuntime} from './runtime-install.mjs';
import {installService,removeService} from './service.mjs';import {checkBridge} from './desktop-install.mjs';import {waitStopped} from './desktop-upgrade.mjs';
const defaultDirectory=()=>path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop');
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const real={inspectLegacyService,checkLegacyService,waitLegacyService,retireLegacyService,restoreLegacyService,inspectLegacyRouterRoute,captureLegacyRouteRecovery,restoreLegacyRouterRoute,loadRouter,adoptLegacyRouterRoute,verifyRouterSelection,prepareRouterPlan,prepareDirectory,preparedEnvironment,inspectRouterCompatibility,routerMigrationPreflight,reconcileRouterSource,stageRelease,verifyRelease,installRuntime,installService,removeService,checkBridge,waitStopped,freePort};
const transition=(file,tx,phase)=>{tx.phase=phase;save(file,tx);};
function validate(root,tx){if(tx.release&&(path.dirname(tx.release)!==path.join(root,'releases')||!/^([a-f0-9]{64})$/.test(path.basename(tx.release))))throw Error('Invalid migration code release path.');for(const name of ['prepared','router-plan','legacy']){const file=path.join(root,name);if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Migration paths must not be symbolic links.');}if(tx.kind!=='bridge-desktop-migration'||tx.prepared!==path.join(root,'prepared')||tx.plan!==path.join(root,'router-plan')||tx.backup!==path.join(root,'legacy/original.plist')||!path.isAbsolute(tx.routerRoot))throw Error('Invalid legacy desktop migration record.');}
function installedRecord(tx){return {kind:'bridge-desktop-install',status:'installed',phase:'awaiting-client-verification',routerRoot:tx.routerRoot,models:tx.legacy.models,prepared:tx.prepared,plan:tx.plan,binary:tx.binary,release:tx.release,migratedLegacyService:true};}
async function recover(root,tx,deps){
 const file=path.join(root,'desktop-migration.json');validate(root,tx);
 transition(file,tx,'restoring-legacy-service');await deps.waitLegacyService(tx.legacy,{check:async snapshot=>{await deps.restoreLegacyService(snapshot,{backup:tx.backup});return deps.checkLegacyService(snapshot);}});
 if(tx.routeRecovery){transition(file,tx,'restoring-legacy-route');await deps.restoreLegacyRouterRoute(tx.plan,{api:await deps.loadRouter(tx.routerRoot),recovery:tx.routeRecovery});}
 delete tx.routeRecovery;transition(file,tx,'removing-candidate-service');await deps.removeService(tx.prepared);
 if(tx.candidatePorts)await deps.waitStopped(tx.prepared,{environment:tx.candidatePorts});
 else if(fs.existsSync(tx.prepared))await deps.waitStopped(tx.prepared);
 if(tx.preparation==='creating'){
  if(fs.existsSync(tx.prepared)){
   try{deps.preparedEnvironment(tx.prepared,{});}catch{
    const history=path.join(root,'history');fs.mkdirSync(history,{recursive:true,mode:0o700});
    fs.renameSync(tx.prepared,path.join(history,'interrupted-preparation-'+randomUUID()));
    delete tx.candidateTokenHashes;
   }
  }
  delete tx.preparation;
 }
 tx.status='restored';transition(file,tx,'legacy-restored');return {restored:true,legacyServiceHealthy:true,backupsPreserved:true};
}
// Internal coordinator until isolated real-service lifecycle and crash scenarios
// pass. It never restarts the Codex application. Router publication may restart
// Router, and is therefore executed only after both services have been checked.
export async function migrateDesktop({directory=defaultDirectory(),routerRoot=path.join(os.homedir(),'.local/share/codex-router'),legacyPlist,platform=process.platform}={},deps={}){
 deps={...real,...deps};if(platform!=='darwin')throw Error('Legacy desktop migration currently targets macOS only.');
 const root=path.resolve(directory),file=path.join(root,'desktop-migration.json');routerRoot=path.resolve(routerRoot);
 if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('Migration directory must not be a symbolic link.');fs.mkdirSync(root,{recursive:true,mode:0o700});const unlock=acquireInstallLock(root);
 let tx,owned=false;
 try{
  if(fs.existsSync(file)){
   if(fs.lstatSync(file).isSymbolicLink())throw Error('Migration record must not be a symbolic link.');tx=JSON.parse(fs.readFileSync(file));validate(root,tx);if(tx.routerRoot!==routerRoot||(legacyPlist&&path.resolve(legacyPlist)!==tx.legacy.plist))throw Error('Migration options differ from the saved operation.');
   if(tx.status==='complete'){
    await deps.checkBridge(tx.prepared);deps.verifyRouterSelection(tx.plan,{api:await deps.loadRouter(routerRoot)});
    if(fs.existsSync(tx.legacy.plist))throw Error('Retired legacy service reappeared; diagnose before repeating migration.');
    if(!fs.existsSync(path.join(root,'desktop-install.json')))save(path.join(root,'desktop-install.json'),installedRecord(tx));
    return {migrated:true,reused:true,modelAccessVerified:false,restartCodexRequired:true};
   }
   owned=true;if(tx.status!=='restored')await recover(root,tx,deps);
  }else{
   if(!legacyPlist)throw Error('Provide the exact legacy LaunchAgent plist to migrate.');
   if(['desktop-install.json','prepared','router-plan'].some(name=>fs.existsSync(path.join(root,name))))throw Error('Destination already contains installation state; use a separate migration directory.');
   const legacy=deps.inspectLegacyService(legacyPlist);await deps.checkLegacyService(legacy);const api=await deps.loadRouter(routerRoot),route=deps.inspectLegacyRouterRoute(api,{legacyTokenPath:legacy.tokenPath});
   if(route.baseUrl!==`http://127.0.0.1:${legacy.port}/v1`||JSON.stringify([...legacy.models].sort())!==JSON.stringify(Object.keys(route.modelOverrides).sort()))throw Error('Legacy service and Router route do not match.');
   let preflight;try{deps.inspectRouterCompatibility(routerRoot);}catch{preflight=deps.routerMigrationPreflight({routerRoot});if(!preflight.sourceMergeable)throw Error('Legacy Router source cannot be reconciled automatically.');}
   tx={kind:'bridge-desktop-migration',status:'migrating',phase:'inspected',routerRoot,legacy,route,preflight,prepared:path.join(root,'prepared'),plan:path.join(root,'router-plan'),backup:path.join(root,'legacy/original.plist')};
   validate(root,tx);fs.mkdirSync(path.dirname(tx.backup),{recursive:true,mode:0o700});const original=Buffer.from(legacy.contents,'base64');if(fs.existsSync(tx.backup)){if(fs.lstatSync(tx.backup).isSymbolicLink()||!fs.readFileSync(tx.backup).equals(original))throw Error('Existing legacy backup differs; preserve it before migration.');}else fs.writeFileSync(tx.backup,original,{flag:'wx',mode:0o600});save(file,tx);owned=true;
  }
  tx.status='migrating';transition(file,tx,'preparing-candidate');
  const runtime=await deps.installRuntime({directory:path.join(root,'runtimes')});tx.binary=runtime.binary;
  const code=tx.release?deps.verifyRelease(tx.release):deps.stageRelease(path.join(root,'releases'));tx.release=code.directory;save(file,tx);
  if(!fs.existsSync(tx.prepared)){
   let port,upstreamPort;do{port=await deps.freePort();}while([tx.legacy.port,tx.legacy.upstreamPort].includes(port));do{upstreamPort=await deps.freePort();}while([port,tx.legacy.port,tx.legacy.upstreamPort].includes(upstreamPort));
   tx.candidatePorts={BRIDGE_PORT:port,OPENCODE_PORT:upstreamPort};tx.preparation='creating';save(file,tx);
   deps.prepareDirectory(tx.prepared,{models:tx.legacy.models,modelOverrides:tx.route.modelOverrides,port,upstreamPort});
   tx.preparation='ready';save(file,tx);
  }else deps.preparedEnvironment(tx.prepared,{});
  if(fs.lstatSync(path.join(tx.prepared,'state')).isSymbolicLink())throw Error('Migration token directory must not be a symbolic link.');
  const tokenPath=path.join(tx.prepared,'state/local-token'),token=regularToken(tx.legacy.tokenPath).bytes,current=regularToken(tokenPath).bytes;
  if(!tx.candidateTokenHashes){tx.candidateTokenHashes=[hash(current),hash(token)];save(file,tx);}
  if(!tx.candidateTokenHashes.includes(hash(current))||!tx.candidateTokenHashes.includes(hash(token)))throw Error('Migration local credential changed; preserve it for diagnosis.');
  const temporary=tokenPath+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temporary,token,{flag:'wx',mode:0o600});fs.renameSync(temporary,tokenPath);}finally{fs.rmSync(temporary,{force:true});}
  transition(file,tx,'starting-candidate');await deps.installService(tx.prepared,{binary:tx.binary,cli:code.cli});await deps.checkBridge(tx.prepared);await deps.checkLegacyService(tx.legacy);
  transition(file,tx,'reconciling-source');if(tx.preflight)deps.reconcileRouterSource(routerRoot,{expected:tx.preflight});else deps.inspectRouterCompatibility(routerRoot);
  const api=await deps.loadRouter(routerRoot),legacy=deps.inspectLegacyRouterRoute(api,{legacyTokenPath:tx.legacy.tokenPath});
  if(fs.existsSync(tx.plan)){const history=path.join(root,'history');fs.mkdirSync(history,{recursive:true,mode:0o700});fs.renameSync(tx.plan,path.join(history,'migration-plan-'+Date.now()));}
  deps.prepareRouterPlan(tx.plan,{prepared:tx.prepared,routerState:api.paths.STATE_DIR,legacy});tx.routeRecovery=deps.captureLegacyRouteRecovery(tx.plan,{api});
  transition(file,tx,'publishing-candidate');await deps.adoptLegacyRouterRoute(tx.plan,{api});await deps.checkBridge(tx.prepared);await deps.checkLegacyService(tx.legacy);
  transition(file,tx,'retiring-legacy');await deps.retireLegacyService(tx.legacy,{backup:tx.backup});await deps.waitStopped(tx.prepared,{environment:{BRIDGE_PORT:tx.legacy.port,OPENCODE_PORT:tx.legacy.upstreamPort}});
  await deps.checkBridge(tx.prepared);deps.verifyRouterSelection(tx.plan,{api});tx.status='complete';transition(file,tx,'awaiting-client-verification');save(path.join(root,'desktop-install.json'),installedRecord(tx));
  return {migrated:true,reused:false,models:tx.legacy.models,modelAccessVerified:false,restartCodexRequired:true};
 }catch(error){
  if(owned&&tx?.status!=='complete'){
   try{await recover(root,tx,deps);}catch(recoveryError){throw new AggregateError([error,recoveryError],'Migration and recovery did not complete. Preserve migration records and run migration recovery.');}
   throw Error('Migration failed; the legacy route and healthy service were restored.',{cause:error});
  }
  throw error;
 }finally{unlock();}
}
export async function recoverDesktopMigration({directory=defaultDirectory()}={},deps={}){
 deps={...real,...deps};const root=path.resolve(directory),unlock=acquireInstallLock(root);
 try{const file=path.join(root,'desktop-migration.json');if(fs.lstatSync(file).isSymbolicLink())throw Error('Migration record must not be a symbolic link.');const tx=JSON.parse(fs.readFileSync(file));if(tx.status==='complete')throw Error('Completed migration uses normal managed lifecycle commands.');return await recover(root,tx,deps);}finally{unlock();}
}
