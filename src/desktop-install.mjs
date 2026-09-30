import fs from 'node:fs';
import {stageRelease,verifyRelease} from './releases.mjs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {writeInstallState,acquireInstallLock} from './install-state.mjs';
import {ensureRouter} from './router-install.mjs';
import {supportedNode} from './prerequisites.mjs';
import {modelProfile} from './model-profiles.mjs';
import {installRuntime} from './runtime-install.mjs';
import {prepareDirectory,preparedEnvironment} from './setup.mjs';
import {installService,removeService} from './service.mjs';
import {prepareRouterPlan} from './router-plan.mjs';
import {loadRouter,registerRouter,unregisterRouter} from './router-registration.mjs';
const defaults=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'];
const save=writeInstallState;
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
export async function checkBridge(prepared,{fetchImpl=fetch}={}){
 const env=preparedEnvironment(prepared,{}),token=fs.readFileSync(path.join(prepared,'state/local-token'),'utf8').trim();
 const url=`http://127.0.0.1:${env.BRIDGE_PORT}`;
 for(let i=0;i<40;i++){
  try{const response=await fetchImpl(url+'/health',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(1500)});
   if(response.ok&&(await response.json()).ok)return {healthy:true};}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 throw new Error('Bridge did not become healthy. Check service-status and local service logs. No model registration was attempted.');
}
const real={preparedEnvironment,ensureRouter,installRuntime,prepareDirectory,installService,removeService,prepareRouterPlan,loadRouter,registerRouter,unregisterRouter,checkBridge,freePort};
export async function installDesktop({directory=path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop'),
 routerRoot=path.join(os.homedir(),'.local/share/codex-router'),models,platform=process.platform,nodeVersion=process.versions.node}={},deps=real){
 if(platform!=='darwin')throw new Error('Desktop installation currently targets macOS only.');
 if(!supportedNode(nodeVersion))throw new Error('Install Node.js 22.19 or later before desktop installation.');
 const root=path.resolve(directory),receiptPath=path.join(root,'desktop-install.json');
 if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw new Error('Installation directory must not be a symbolic link.');
 if(models===undefined)models=fs.existsSync(receiptPath)?JSON.parse(fs.readFileSync(receiptPath)).models:defaults;
 if(!Array.isArray(models)||!models.length||new Set(models).size!==models.length||models.some(x=>!modelProfile(x)))throw new Error('Choose distinct supported model IDs.');
 // Resolve dependencies before creating or mutating the user's installation.
 const router=await deps.ensureRouter(routerRoot);
 routerRoot=router.root;
 const api=await deps.loadRouter(routerRoot);
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const release=acquireInstallLock(root);
 let receipt,ownsOperation=false;
 try{
  if(fs.existsSync(receiptPath)){
   receipt=JSON.parse(fs.readFileSync(receiptPath));
   if(receipt.kind!=='bridge-desktop-install'||receipt.routerRoot!==path.resolve(routerRoot)||JSON.stringify(receipt.models)!==JSON.stringify(models))throw new Error('Existing installation settings differ; keep its record and use its original settings. Use the models command to change an installed selection.');
   validateReceipt(root,receipt);
   if(receipt.modelChange)throw new Error('An interrupted model change needs recover-models first.');
   if(receipt.upgrade)throw new Error('An interrupted upgrade needs recover-upgrade before installation.');
   if(receipt.status==='installed'){
   const code=receipt.release?verifyRelease(receipt.release):undefined;
   await deps.installService(receipt.prepared,{binary:receipt.binary,cli:code?.cli});await deps.checkBridge(receipt.prepared);
   await deps.registerRouter(receipt.plan,{api});
   return {installed:true,reused:true,models,modelAccessVerified:false,restartCodexRequired:true};
   }
   if(!['installing','incomplete','uninstalled'].includes(receipt.status))throw new Error('Unknown installation status; inspect its record.');
  }
  if(!receipt&&(fs.existsSync(path.join(root,'prepared'))||fs.existsSync(path.join(root,'router-plan'))))throw new Error('Unowned preparation exists in the installation directory; leaving it unchanged.');
  const runtime=await deps.installRuntime({directory:path.join(root,'runtimes')});
  const port=await deps.freePort();let upstreamPort=await deps.freePort();while(upstreamPort===port)upstreamPort=await deps.freePort();
  const prepared=path.join(root,'prepared'),plan=path.join(root,'router-plan');
  const resumed=Boolean(receipt);
  // Preserve legacy service paths on resume; migration belongs to explicit upgrade.
  const code=receipt?(receipt.release?verifyRelease(receipt.release):undefined):stageRelease(path.join(root,'releases'));
  receipt={kind:'bridge-desktop-install',status:'installing',phase:'preparing',routerRoot:path.resolve(routerRoot),models,prepared,plan,binary:runtime.binary,release:code?.directory};save(receiptPath,receipt);ownsOperation=true;
  if(fs.existsSync(prepared))deps.preparedEnvironment(prepared,{});
  else deps.prepareDirectory(prepared,{models,port,upstreamPort});
  if(fs.existsSync(plan)&&!fs.existsSync(path.join(plan,'registration.json'))){
   const archive=path.join(root,'history');fs.mkdirSync(archive,{recursive:true,mode:0o700});
   fs.renameSync(plan,path.join(archive,'plan-'+Date.now()));
  }
  if(!fs.existsSync(plan))deps.prepareRouterPlan(plan,{prepared,routerState:api.paths.STATE_DIR});
  receipt.phase='starting-service';save(receiptPath,receipt);
  await deps.installService(prepared,{binary:runtime.binary,cli:code?.cli});
  await deps.checkBridge(prepared);
  receipt.phase='registering-models';save(receiptPath,receipt);
  await deps.registerRouter(plan,{api});
  receipt.status='installed';receipt.phase='awaiting-client-verification';save(receiptPath,receipt);
  return {installed:true,reused:false,resumed,models,modelAccessVerified:false,restartCodexRequired:true};
 }catch(error){
  if(ownsOperation&&receipt?.status==='installing'){
   // Registration owns its transactional rollback; do not delete its evidence
   // or preparation. Stop only the service created by this installation.
   try{deps.removeService(receipt.prepared);receipt.serviceStopped=true;}catch{receipt.serviceStopped=false;}
   receipt.status='incomplete';receipt.failurePhase=receipt.phase;save(receiptPath,receipt);
  }
  throw error;
 }finally{release();}
}
export async function uninstallDesktop({directory=path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop')}={},deps=real){
 const root=path.resolve(directory),file=path.join(root,'desktop-install.json');
 const release=acquireInstallLock(root);
 try{
  const receipt=JSON.parse(fs.readFileSync(file));validateReceipt(root,receipt);
  if(receipt.modelChange)throw new Error('An interrupted model change needs recover-models first.');
   if(receipt.upgrade)throw new Error('An interrupted upgrade needs recover-upgrade before uninstall.');
  const api=await deps.loadRouter(receipt.routerRoot);
  // Remove model routes first, keeping a working service if ownership checks fail.
  if(fs.existsSync(path.join(receipt.plan,'registration.json')))await deps.unregisterRouter(receipt.plan,{api});
  deps.removeService(receipt.prepared);
  receipt.status='uninstalled';receipt.phase='stopped';save(file,receipt);
  return {removed:true,routerPreserved:true,credentialsAndBackupsPreserved:true,restartCodexRequired:true};
 }finally{release();}
}

export function validateReceipt(root,receipt){
 if(receipt.kind!=='bridge-desktop-install'||receipt.prepared!==path.join(root,'prepared')||receipt.plan!==path.join(root,'router-plan')||!path.isAbsolute(receipt.routerRoot))throw new Error('Invalid managed desktop installation record.');
 if(receipt.release&&(path.dirname(receipt.release)!==path.join(root,'releases')||!/^[a-f0-9]{64}$/.test(path.basename(receipt.release))))throw new Error('Invalid managed code release path.');
 for(const candidate of [receipt.prepared,receipt.plan])if(fs.existsSync(candidate)&&fs.lstatSync(candidate).isSymbolicLink())throw new Error('Managed installation paths must not be symbolic links.');
}
