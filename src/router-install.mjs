import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ensureRouterCompatibility} from './router-compatibility.mjs';
import {acquireInstallLock,writeInstallState as save} from './install-state.mjs';
import {captureRouterSource,verifyRouterSource} from './router-source-state.mjs';
import {createHash} from 'node:crypto';
const pin=JSON.parse(fs.readFileSync(new URL('../runtime/router.json',import.meta.url)));
const marker='.bridge-router-install.json';
export function runDependency(command,args,{cwd,env=process.env,timeout=600000,onSpawn=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-65536);});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
  const kill=signal=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
  let escalation,trackingError;
  child.once('spawn',()=>{try{onSpawn(child.pid);}catch{trackingError=new Error('Could not record dependency process; it was stopped.');kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),5000);}});
  const timer=setTimeout(()=>{kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),5000);},timeout);
  child.once('error',error=>{clearTimeout(timer);clearTimeout(escalation);reject(error);});
  child.once('close',status=>{clearTimeout(timer);clearTimeout(escalation);trackingError?reject(trackingError):resolve({status,stdout,stderr});});
 });
}
const processAlive=pid=>[pid,-pid].some(target=>{try{process.kill(target,0);return true;}catch(error){return error.code!=='ESRCH';}});
export async function ensureRouter(directory=path.join(os.homedir(),'.local/share/codex-router'),
 {run=runDependency,env=process.env,platform=process.platform,compatibility=ensureRouterCompatibility,alive=processAlive}={}){
 if(platform!=='darwin')throw new Error('Automatic Router installation currently targets macOS.');
 const root=path.resolve(directory),record=path.join(root,marker),parent=path.dirname(root);
 fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const lockName='.bridge-router-'+createHash('sha256').update(root).digest('hex').slice(0,20);
 const unlock=acquireInstallLock(parent,{name:lockName,alive});
 let receipt,stage,moved=false,resumed=false;
 const execute=async(cmd,args,cwd)=>{
  if(receipt){delete receipt.lastExitCode;save(record,receipt);}
  const result=await run(cmd,args,{cwd,env,onSpawn:pid=>{
   if(receipt){receipt.worker={pid};save(record,receipt);}
  }});
  // A result is emitted only after the dependency process has exited.
  if(receipt){delete receipt.worker;receipt.lastExitCode=result.status;save(record,receipt);}
  if(result.status!==0){
   const next=receipt?.phase==='router-setup'&&result.status!==2
    ? 'Client setup may be partially applied; preserve its state for recovery.'
    : 'Resolve the reported prerequisite or network issue, then re-run install.';
   throw new Error(`Router dependency step failed: ${cmd} ${args[0]}. ${next} Credentials and command output were not printed.`);
  }
  return result;
 };
 try{
  if(fs.existsSync(root)){
   if(fs.lstatSync(root).isSymbolicLink())throw new Error('Use the real Router installation path, not a symbolic link.');
   let saved;
   if(fs.existsSync(record)){
    if(fs.lstatSync(record).isSymbolicLink())throw Error('Router installation record must not be a symbolic link.');
    saved=JSON.parse(fs.readFileSync(record));
    if(saved.kind!=='bridge-managed-router')throw Error('Unrecognized Router installation record.');
    if(saved.status!=='installed'){
     if(!['installing','incomplete'].includes(saved.status)||saved.revision!==pin.revision)throw Error('Router preparation record is incompatible; preserve it for diagnosis.');
     if(saved.worker){
      if(!Number.isInteger(saved.worker.pid)||saved.worker.pid<1||alive(saved.worker.pid))throw Error('A recorded Router dependency process may still be running; wait before retrying.');
     }
     verifyRouterSource(root,saved.sourceFiles);
     // Pinned setup reserves exit 2 for incomplete preflight/configuration. A
     // crash, timeout or ordinary failure can have applied client/service state;
     // do not infer rollback from those outcomes.
     const retryableSetup=saved.phase==='router-setup'&&saved.lastExitCode===2;
     if(!['node-dependencies','router-compatibility'].includes(saved.phase)&&!retryableSetup)throw Error('Router client setup may be partially applied; dependency preparation is retained, but client setup requires state recovery before retrying.');
     receipt=saved;delete receipt.worker;receipt.status='installing';save(record,receipt);resumed=true;
    }
   }
   const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
   if(manifest.name!==pin.packageName||!fs.existsSync(path.join(root,'src/model-overlay-publication.mjs')))throw new Error('Existing directory is not a compatible Codex Router; leaving it unchanged.');
   if(!receipt){const applied=compatibility(root);return {root,reused:true,managed:Boolean(saved),compatibility:applied.id};}
  }else{
   stage=fs.mkdtempSync(path.join(parent,'.bridge-router-download-'));
   await execute('git',['init','--quiet'],stage);
   await execute('git',['remote','add','origin',pin.repository],stage);
   await execute('git',['fetch','--depth=1','origin',pin.revision],stage);
   await execute('git',['checkout','--detach','FETCH_HEAD'],stage);
   const actual=(await execute('git',['rev-parse','HEAD'],stage)).stdout.trim();
   if(actual!==pin.revision)throw new Error('Downloaded Router revision did not match the pinned revision.');
   const pkg=JSON.parse(fs.readFileSync(path.join(stage,'package.json')));
   if(pkg.name!==pin.packageName)throw new Error('Downloaded Router package identity mismatch.');
   if(fs.existsSync(root))throw new Error('Router destination appeared during download; leaving it unchanged.');
   const initial={kind:'bridge-managed-router',version:2,status:'installing',revision:pin.revision,phase:'node-dependencies',sourceFiles:captureRouterSource(stage)};
   // Publish ownership together with the checkout, avoiding an unowned directory
   // if the driver exits immediately after rename.
   save(path.join(stage,marker),initial);fs.renameSync(stage,root);moved=true;receipt=initial;
  }
  if(receipt.phase==='node-dependencies'){
   await execute('npm',['ci','--omit=dev','--no-audit','--no-fund'],root);
   receipt.phase='router-compatibility';save(record,receipt);
  }
  receipt.compatibility=compatibility(root).id;
  receipt.phase='router-setup';save(record,receipt);
  await execute(process.execPath,['src/setup.mjs','--auto','--no-provider','--no-tray','--adopt-native-catalog'],root);
  receipt.phase='ready';receipt.status='installed';save(record,receipt);
  return {root,reused:false,resumed,managed:true,revision:pin.revision,compatibility:receipt.compatibility};
 }catch(error){
  if(receipt){receipt.status='incomplete';save(record,receipt);}
  throw error;
 }finally{
  if(stage&&!moved)fs.rmSync(stage,{recursive:true,force:true});
  unlock();
 }
}
