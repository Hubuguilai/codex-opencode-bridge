import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {preparedEnvironment} from './setup.mjs';
import {verifyRelease} from './releases.mjs';
import {serviceStatus} from './service.mjs';

// No provider inference, credential display or state mutations.
export async function installationStatus({directory=path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop'),fetchImpl=fetch,inspectService=serviceStatus}={}){
 const root=path.resolve(directory),checks=[];
 const result={kind:'bridge-installation-status',readOnly:true,installed:false,checks,modelAccessVerified:false,desktopPickerVerified:false};
 const add=(id,ok,message,next)=>checks.push({id,ok,message,...(!ok?{next}:{})});
 let record;
 try{record=JSON.parse(fs.readFileSync(path.join(root,'desktop-install.json')));}catch{
  add('record',false,'No readable managed installation record.','Run install, or provide the original --directory.');return result;
 }
 if(record.kind!=='bridge-desktop-install'||record.prepared!==path.join(root,'prepared')||record.plan!==path.join(root,'router-plan')){
  add('record',false,'Installation record is inconsistent.','Preserve the record and diagnose ownership; do not overwrite it.');return result;
 }
 result.status=record.status;result.phase=record.phase;result.installed=record.status==='installed';
 add('record',result.installed,'Installation state: '+record.status,record.status==='uninstalled'?'Run install to restore this bridge.':'Re-run install with the same options to resume a bridge-stage failure.');
 result.managedCodeRelease=Boolean(record.release);
 if(record.release){
  try{
   if(path.dirname(record.release)!==path.join(root,'releases'))throw Error('Unexpected release location');
   const code=verifyRelease(record.release);result.codeRelease=code.id;
   add('code',true,'Managed code release matches its recorded content.');
  }catch{add('code',false,'Managed code release is missing or modified.','Preserve the affected release and diagnose it; do not overwrite or start edited code.');}
 }
 let env;
 try{env=preparedEnvironment(record.prepared,{});add('preparation',true,'Prepared files match their ownership checks.');}catch{
  add('preparation',false,'Prepared files are missing, moved or edited.','Preserve user edits and inspect the preparation before changing configuration.');return result;
 }
 try{
  const status=inspectService(record.prepared);result.service={installed:status.installed,loaded:status.loaded??false,running:status.running};
  add('service',status.running===true,status.running?'Bridge service is running.':'Bridge service is not running.','Re-run install or inspect the private service logs.');
 }catch{add('service',false,'Cannot verify managed service ownership.','Inspect the service record and any user changes.');}
 try{
  const port=Number(env.BRIDGE_PORT);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
  const token=fs.readFileSync(path.join(record.prepared,'state/local-token'),'utf8').trim();
  const response=await fetchImpl(`http://127.0.0.1:${port}/health`,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(3000)});
  const ok=response.ok&&(await response.json()).ok===true;
  add('health',ok,ok?'Bridge and OpenCode health check passed.':'Local health check returned HTTP '+response.status+'.','Check the service and its runtime path; health does not test model permissions.');
 }catch{add('health',false,'Local bridge health check could not complete.','Check the recorded service and ports; do not start a duplicate service.');}
 try{
  const plan=JSON.parse(fs.readFileSync(path.join(record.plan,'router-plan.json')));
  const catalog=JSON.parse(fs.readFileSync(path.join(plan.routerState,'merged-models.json')));
  const visible=new Set(catalog.models.filter(x=>x.visibility==='list').map(x=>x.slug));
  const missing=plan.models.filter(x=>!visible.has(x.slug)).map(x=>x.slug);
  result.models=plan.models.map(x=>({id:x.slug,name:x.displayName,published:visible.has(x.slug)}));
  add('catalog',missing.length===0,missing.length?'Some requested models are missing from the published catalog.':'Requested models are present in the published catalog.','Check registration, provider readiness and discovery mode; then republish using install.');
 }catch{add('catalog',false,'Published model catalog could not be checked.','Inspect the recorded integration plan and Router state.');}
 result.configurationReady=checks.every(x=>x.ok);
 result.next=result.configurationReady?'Verify the actual Codex picker and live text/tool/image workflows.':'Resolve failed checks before model workflow verification.';
 return result;
}
