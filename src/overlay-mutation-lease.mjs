import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {acquireInstallLock,writeInstallState as save} from './install-state.mjs';
const identity=stat=>({dev:stat.dev,ino:stat.ino,birthtimeMs:stat.birthtimeMs});
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.birthtimeMs===b.birthtimeMs;
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
// Only the fingerprinted pinned Router has the known ten-minute stale horizon.
// Reclaim well before that horizon, when it cannot concurrently reap/reacquire
// our dead owner's lock. Publishing may have child workers; never reclaim it.
export function recoverOverlayMutationLease(directory,api,{isAlive=alive,now=Date.now}={}){
 const file=path.join(directory,'overlay-mutation-lease.json');if(!fs.existsSync(file))return {recovered:false};
 const unlock=acquireInstallLock(directory,{name:'.overlay-recovery-lock'});
 try{
  if(!fs.existsSync(file))return {recovered:false};
  if(fs.lstatSync(file).isSymbolicLink())throw Error('Overlay lease must not be a symbolic link.');
  const lease=JSON.parse(fs.readFileSync(file)),lock=path.join(api.paths.STATE_DIR,'model-overlay-transaction.lock');
  if(lease.kind!=='bridge-overlay-mutation-lease'||lease.lock!==lock||!Number.isInteger(lease.pid)||lease.pid<1)throw Error('Invalid overlay mutation lease.');
  if(isAlive(lease.pid))return {recovered:false,reason:'owner_alive'};
  if(!fs.existsSync(lock)){fs.unlinkSync(file);return {recovered:false,reason:'lock_absent'};}
  const stat=fs.lstatSync(lock);
  if(!api.overlayLockVerified||lease.phase!=='mutating'||stat.isSymbolicLink()||!stat.isDirectory()||!same(lease.identity,identity(stat))||now()-stat.mtimeMs>=300000||fs.readdirSync(lock).length)return {recovered:false,reason:'native_lock_recovery_required'};
  // This application's recovery drivers serialize on the sidecar lock. Other
  // Router callers cannot acquire this younger-than-stale directory yet.
  const current=fs.lstatSync(lock);if(!same(identity(current),lease.identity))throw Error('Overlay lock identity changed during recovery.');
  fs.rmdirSync(lock);fs.unlinkSync(file);return {recovered:true};
 }finally{unlock();}
}
export async function trackedOverlayMutation(directory,api,options){
 recoverOverlayMutationLease(directory,api);
 const file=path.join(directory,'overlay-mutation-lease.json'),lock=path.join(api.paths.STATE_DIR,'model-overlay-transaction.lock');let lease;
 const capture=()=>{
  const snapshots=options.capture?options.capture():api.overlay.captureModelOverlayFiles(options.files);
  if(api.overlayLockVerified&&fs.existsSync(lock)){
   const stat=fs.lstatSync(lock);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unexpected Router overlay lock.');
   lease={kind:'bridge-overlay-mutation-lease',id:randomUUID(),pid:process.pid,lock,identity:identity(stat),phase:'mutating'};save(file,lease);
  }
  return snapshots;
 };
 const applyPublication=async args=>{if(lease){lease.phase='publishing';save(file,lease);}return options.applyPublication(args);};
 try{return await api.overlay.transactModelOverlayMutation({...options,capture,applyPublication});}
 finally{if(lease&&fs.existsSync(file)&&JSON.parse(fs.readFileSync(file)).id===lease.id)fs.unlinkSync(file);}
}
