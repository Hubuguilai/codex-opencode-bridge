import {routerVerificationRoute} from './router-verification.mjs';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {acquireInstallLock,writeInstallState as save} from './install-state.mjs';
import {validateReceipt,checkBridge} from './desktop-install.mjs';
import {preparedEnvironment} from './setup.mjs';import {verifyRelease} from './releases.mjs';
import {checkIdle} from './desktop-upgrade.mjs';import {verifyClientRoute} from './client-verification.mjs';
export async function verifyInstalled({directory=path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop'),live=false,route='router',onProgress=()=>{}}={},deps={}){
 if(!['router','bridge'].includes(route))throw Error('Verification route must be router or bridge.');
 if(!live)throw Error('Verification sends model requests using your OpenCode account. Run verify --live to opt in.');
 const root=path.resolve(directory);if(fs.lstatSync(root).isSymbolicLink())throw Error('Installation directory must not be a symbolic link.');
 const unlock=acquireInstallLock(root);
 const runtime={checkBridge,checkIdle,verifyClientRoute,routerVerificationRoute,...deps};
 try{
  const record=JSON.parse(fs.readFileSync(path.join(root,'desktop-install.json')));validateReceipt(root,record);
  if(record.status!=='installed'||record.upgrade||record.modelChange)throw Error('Complete installation or recovery before model verification.');
  if(!record.release)throw Error('Migrate the legacy installation before using managed verification.');
  const code=verifyRelease(record.release),env=preparedEnvironment(record.prepared,{});
  if(env.BRIDGE_MODELS!==record.models.join(','))throw Error('Installed model selection differs from prepared configuration.');
  await runtime.checkBridge(record.prepared);await runtime.checkIdle(record.prepared);
  let target;
  if(route==='router')target=await runtime.routerVerificationRoute(record);
  else{
   const catalog=JSON.parse(fs.readFileSync(path.join(record.prepared,'models.json')));
   target={name:'installed_bridge_direct_real_codex_client',baseUrl:`http://127.0.0.1:${env.BRIDGE_PORT}/v1`,token:fs.readFileSync(path.join(record.prepared,'state/local-token'),'utf8').trim(),models:record.models.map(model=>({id:model,model,entry:catalog.models.find(x=>x.slug===model)}))};
  }
  const report={date:new Date().toISOString(),kind:'installed-client-verification',codeReleaseSha256:code.id,route:target.name,desktopPickerVerified:false,routerForwardingVerified:false,models:[],passed:false};
  if(target.compatibility)report.routerCompatibility=target.compatibility;
  const folder=path.join(root,'verification');fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const receipt=path.join(folder,report.date.replaceAll(':','-')+'.json');save(receipt,report);
  for(const {model,entry,images,routerAdvertisesImages} of target.models){if(!entry)throw Error('Installed catalog is missing a model.');
   onProgress({model,phase:'starting'});
   const nativeImages=images??entry.input_modalities?.includes('image');
   const result=await runtime.verifyClientRoute({model,baseUrl:target.baseUrl,token:target.token,route:target.name,catalogEntry:entry,images:nativeImages,onProgress});
   result.nativeImageInput=nativeImages===true;
   if(routerAdvertisesImages&&!nativeImages)result.routerAddsImageCapability=true;
   report.models.push(result);save(receipt,report);
   if(['authentication','model_access','rate_limit'].includes(result.errorCategory)){report.stoppedOnAccessFailure=true;break;}
  }
  report.passed=report.models.length===record.models.length&&report.models.every(x=>x.passed);
  report.routerForwardingVerified=route==='router'&&report.passed;
  report.skippedModels=record.models.slice(report.models.length);save(receipt,report);
  return {...report,receipt,next:report.passed?(route==='router'?'Verify the actual Desktop picker and complete workflows.':'Verify the actual Desktop picker and Router route. This check used the installed bridge directly.'):'Inspect failed check categories. Do not repeatedly retry permission or quota failures.'};
 }finally{unlock();}
}
