import fs from 'node:fs';
import {ensureRouterCompatibility} from './router-compatibility.mjs';
import {loadRouter,registerRouter} from './router-registration.mjs';
const refreshRouter=async record=>registerRouter(record.plan,{api:await loadRouter(record.routerRoot)});
import path from 'node:path';
import os from 'node:os';
import {acquireInstallLock,writeInstallState as save} from './install-state.mjs';
import {stageRelease,verifyRelease} from './releases.mjs';
import {installRuntime} from './runtime-install.mjs';
import {preparedEnvironment} from './setup.mjs';
import {serviceConfiguration,installService,removeService,availablePort} from './service.mjs';
import {checkBridge,validateReceipt} from './desktop-install.mjs';
const defaultDirectory=()=>path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop');
export async function checkIdle(prepared){
 const env=preparedEnvironment(prepared,{});
 const response=await fetch(`http://127.0.0.1:${env.BRIDGE_PORT}/health`,{signal:AbortSignal.timeout(3000)});
 const health=await response.json();
 if(!response.ok||!health.ok||health.active!==0)throw Error('Bridge is unavailable or has active requests. Finish tasks before upgrading.');
}
export async function waitStopped(prepared,{environment}={}){
 const env=environment??preparedEnvironment(prepared,{});
 for(let i=0;i<50;i++){
  try{await availablePort(Number(env.BRIDGE_PORT));await availablePort(Number(env.OPENCODE_PORT));return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error('Old service ports have not been released.');
}
const real={ensureRouterCompatibility,refreshRouter,stageRelease,verifyRelease,installRuntime,serviceConfiguration,installService,removeService,checkBridge,checkIdle,waitStopped};
function read(root){
 if(fs.lstatSync(root).isSymbolicLink())throw Error('Installation directory must not be a symbolic link.');
 const file=path.join(root,'desktop-install.json');if(fs.lstatSync(file).isSymbolicLink())throw Error('Installation record must not be a symbolic link.');
 const record=JSON.parse(fs.readFileSync(file));validateReceipt(root,record);return record;
}
function checkRelease(root,directory,deps){
 if(typeof directory!=='string'||path.dirname(directory)!==path.join(root,'releases'))throw Error('Upgrade requires a managed code release. Legacy service migration is not yet supported.');
 return deps.verifyRelease(directory);
}
async function restore(root,record,deps){
 const transaction=record.upgrade;
 if(!transaction||transaction.kind!=='bridge-code-upgrade')throw Error('No recognized interrupted upgrade.');
 const original=transaction.original;validateReceipt(root,original);
 if(original.upgrade||original.status!=='installed')throw Error('Invalid upgrade recovery record.');
 const code=checkRelease(root,original.release,deps);
 record.phase='restoring-previous-version';save(path.join(root,'desktop-install.json'),record);
 deps.removeService(original.prepared);await deps.waitStopped(original.prepared);
 await deps.installService(original.prepared,{binary:original.binary,cli:code.cli,node:transaction.node,env:transaction.servicePath?{PATH:transaction.servicePath}:undefined});
 await deps.checkBridge(original.prepared);
 await deps.refreshRouter(original);
 save(path.join(root,'desktop-install.json'),original);
 return {restored:true,release:code.id,modelAccessVerified:false};
}
export async function upgradeDesktop({directory=defaultDirectory(),rollback=false}={},deps={}){
 deps={...real,...deps};
 const root=path.resolve(directory),unlock=acquireInstallLock(root);
 try{
  const original=read(root);
  if(original.modelChange)throw Error('An interrupted model change needs recover-models first.');
  if(original.upgrade)throw Error('An interrupted upgrade needs recover-upgrade first.');
  if(original.status!=='installed')throw Error('Install and verify the bridge before upgrading.');
  const before=checkRelease(root,original.release,deps);
  const currentService=deps.serviceConfiguration(original.prepared);
  if(currentService.cli!==before.cli||currentService.binary!==original.binary)throw Error('Service paths differ from the installation record; preserve changes and diagnose ownership.');
  if(rollback&&!original.previousRelease)throw Error('No previous managed version is recorded for rollback.');
  const target=rollback?checkRelease(root,original.previousRelease,deps):deps.stageRelease(path.join(root,'releases'));
  const binary=rollback?original.previousBinary:(await deps.installRuntime({directory:path.join(root,'runtimes')})).binary;
  if(!binary||!path.isAbsolute(binary))throw Error('Missing managed runtime for the selected version.');
  await deps.checkIdle(original.prepared);
  deps.ensureRouterCompatibility(original.routerRoot);
  if(target.id===before.id&&binary===original.binary){await deps.checkBridge(original.prepared);await deps.refreshRouter(original);return {upgraded:false,alreadyCurrent:true,release:target.id,modelAccessVerified:false};}
  // Journal before stopping: recovery always restores the original complete record.
  const record={...original,status:'upgrading',phase:'stopping-previous-version',upgrade:{kind:'bridge-code-upgrade',original,targetRelease:target.directory,targetBinary:binary,node:currentService.node,servicePath:currentService.servicePath}};
  save(path.join(root,'desktop-install.json'),record);
  try{
   deps.removeService(original.prepared);await deps.waitStopped(original.prepared);
   record.phase='starting-new-version';save(path.join(root,'desktop-install.json'),record);
   await deps.installService(original.prepared,{binary,cli:target.cli,node:currentService.node,env:currentService.servicePath?{PATH:currentService.servicePath}:undefined});
   await deps.checkBridge(original.prepared);
   record.phase='refreshing-router';save(path.join(root,'desktop-install.json'),record);
   await deps.refreshRouter(original);
   save(path.join(root,'desktop-install.json'),{...original,release:target.directory,binary,previousRelease:original.release,previousBinary:original.binary,phase:'awaiting-client-verification'});
   return {upgraded:true,rolledBack:rollback,release:target.id,previousRelease:before.id,modelAccessVerified:false};
  }catch(error){
   try{await restore(root,record,deps);}catch(recoveryError){
    throw new AggregateError([error,recoveryError],'Upgrade failed and automatic recovery did not complete. Preserve installation records; run recover-upgrade.');
   }
   throw Error('Upgrade failed; the previous version was restored and passed its health check. Model workflows still require verification.',{cause:error});
  }
 }finally{unlock();}
}
export async function recoverDesktopUpgrade({directory=defaultDirectory()}={},deps={}){
 deps={...real,...deps};
 const root=path.resolve(directory),unlock=acquireInstallLock(root);
 try{return await restore(root,read(root),deps);}finally{unlock();}
}
