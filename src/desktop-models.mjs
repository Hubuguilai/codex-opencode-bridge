import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {acquireInstallLock,writeInstallState as save} from './install-state.mjs';
import {planModelSelection,validateModels,validateSelectionFiles,writeSelectionFiles} from './model-selection.mjs';
import {loadRouter,updateRouterModels,captureRouterSelection,verifyRouterSelection} from './router-registration.mjs';
import {serviceConfiguration,installService,removeService} from './service.mjs';
import {verifyRelease} from './releases.mjs';
import {checkIdle,waitStopped} from './desktop-upgrade.mjs';
import {checkBridge,validateReceipt} from './desktop-install.mjs';
import {ensureRouterCompatibility} from './router-compatibility.mjs';
const real={loadRouter,updateRouterModels,verifyRouterSelection,serviceConfiguration,installService,removeService,checkIdle,waitStopped,checkBridge,ensureRouterCompatibility};
const defaultDirectory=()=>path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop');
function read(root){if(fs.lstatSync(root).isSymbolicLink())throw Error('Installation directory must not be a symbolic link.');const r=JSON.parse(fs.readFileSync(path.join(root,'desktop-install.json')));validateReceipt(root,r);return r;}
function serviceOptions(record,transaction){
 if(!record.release)throw Error('Model changes require an independent managed code release. Migrate the legacy installation first.');
 const code=verifyRelease(record.release);
 return {binary:record.binary,cli:code.cli,node:transaction.node,env:transaction.servicePath?{PATH:transaction.servicePath}:undefined};
}
async function restore(root,record,deps){
 const tx=record.modelChange;if(tx?.kind!=='bridge-model-change')throw Error('No recognized interrupted model change.');
 const original=tx.original;validateReceipt(root,original);
 if(original.modelChange||original.upgrade||original.status!=='installed')throw Error('Invalid model recovery record.');
 const options=serviceOptions(original,tx);validateSelectionFiles(original.prepared,tx.files);
 record.phase='restoring-model-selection';save(path.join(root,'desktop-install.json'),record);
 deps.removeService(original.prepared);
 await deps.waitStopped(original.prepared,{environment:JSON.parse(tx.files.before['bridge-env.json'])});
 writeSelectionFiles(original.prepared,tx.files,'before');
 await deps.installService(original.prepared,options);await deps.checkBridge(original.prepared);
 const api=await deps.loadRouter(original.routerRoot);
 await deps.updateRouterModels(original.plan,{api,restoreSelection:tx.router});
 save(path.join(root,'desktop-install.json'),original);
 return {restored:true,models:original.models,modelAccessVerified:false,restartCodexRequired:true};
}
export async function setDesktopModels({directory=defaultDirectory(),models}={},deps={}){
 validateModels(models);deps={...real,...deps};const root=path.resolve(directory),unlock=acquireInstallLock(root);
 try{
  const original=read(root);
  if(original.modelChange)throw Error('Run recover-models before another model change.');
  if(original.upgrade)throw Error('Run recover-upgrade before changing models.');
  if(original.status!=='installed')throw Error('Install the bridge before changing its models.');
  const service=deps.serviceConfiguration(original.prepared),options=serviceOptions(original,service);
  if(service.cli!==options.cli||service.binary!==original.binary)throw Error('Service ownership differs from this installation.');
  const files=planModelSelection(original.prepared,models);
  if(JSON.stringify(JSON.parse(files.before['install-manifest.json']).models)!==JSON.stringify(original.models))throw Error('Recorded model selection differs from its preparation.');
  const api=await deps.loadRouter(original.routerRoot);deps.verifyRouterSelection(original.plan,{api});
  const router=captureRouterSelection(original.plan);
  if(JSON.stringify(JSON.parse(router['router-plan.json']).models.map(x=>x.upstreamModel))!==JSON.stringify(original.models))throw Error('Router and bridge model selections differ; diagnose before changing them.');
  const profilesCurrent=JSON.parse(router['router-plan.json']).models.every(model=>model.visionBridge===false&&model.bridgeStrictImages===true);
  if(JSON.stringify(models)===JSON.stringify(original.models)&&profilesCurrent){
   await deps.checkBridge(original.prepared);return {updated:false,alreadyCurrent:true,models,modelAccessVerified:false};
  }
  await deps.checkIdle(original.prepared);
  deps.ensureRouterCompatibility(original.routerRoot);
  const record={...original,status:'changing-models',phase:'stopping-service',modelChange:{kind:'bridge-model-change',original,files,router,node:service.node,servicePath:service.servicePath}};
  save(path.join(root,'desktop-install.json'),record);
  try{
   deps.removeService(original.prepared);await deps.waitStopped(original.prepared);
   writeSelectionFiles(original.prepared,files,'after');
   record.phase='starting-model-selection';save(path.join(root,'desktop-install.json'),record);
   await deps.installService(original.prepared,options);await deps.checkBridge(original.prepared);
   record.phase='publishing-model-selection';save(path.join(root,'desktop-install.json'),record);
   await deps.updateRouterModels(original.plan,{api,models});
   save(path.join(root,'desktop-install.json'),{...original,models,phase:'awaiting-client-verification'});
   return {updated:true,models,modelAccessVerified:false,restartCodexRequired:true};
  }catch(error){
   try{await restore(root,record,deps);}catch(recoveryError){throw new AggregateError([error,recoveryError],'Model change and recovery did not complete. Preserve records and run recover-models.');}
   throw Error('Model change failed; the previous configuration and healthy service were restored.',{cause:error});
  }
 }finally{unlock();}
}
export async function recoverDesktopModels({directory=defaultDirectory()}={},deps={}){
 deps={...real,...deps};const root=path.resolve(directory),unlock=acquireInstallLock(root);
 try{return await restore(root,read(root),deps);}finally{unlock();}
}
