import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {acquireInstallLock,writeInstallState} from './install-state.mjs';
import {routerMigrationPreflight} from './router-migration-preflight.mjs';
import {reconciledRouterSpec} from './router-reconciled-spec.mjs';
import {ensureRouterCompatibility} from './router-compatibility.mjs';
const shipped=JSON.parse(fs.readFileSync(new URL('../runtime/router-compatibility.json',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Explicit migration component, never an automatic fallback for unknown edits.
// Source only: the caller must coordinate health checks and Router restart.
export function reconcileRouterSource(root,{expected,spec=shipped,afterWrite=()=>{}}={}){
 root=path.resolve(root);if(fs.lstatSync(root).isSymbolicLink())throw Error('Router root must not be a symbolic link.');
 const unlock=acquireInstallLock(root,{name:'.bridge-source-reconciliation-lock'});
 try{
  const folder=path.join(root,'.bridge-router-compatibility'),record=path.join(folder,'reconciliation.json');
  if(fs.existsSync(folder)&&fs.lstatSync(folder).isSymbolicLink())throw Error('Compatibility directory must not be a symbolic link.');
  if(fs.existsSync(record)){
   reconciledRouterSpec(root,spec);
   return {...ensureRouterCompatibility(root,{spec,afterWrite}),reconciled:true,serviceRestarted:false};
  }
  if(fs.existsSync(path.join(folder,'record.json')))throw Error('Existing compatibility ownership must be reconciled through its own upgrade path.');
  const merged=[];const observed=routerMigrationPreflight({routerRoot:root},{spec,onMerged:item=>merged.push(item)});
  if(!expected||hash(JSON.stringify(observed))!==hash(JSON.stringify(expected))||!observed.sourceMergeable)throw Error('Source preflight is missing, changed, or conflicted; repeat inspection before migration.');
  if(merged.length!==spec.files.length)throw Error('Incomplete source reconciliation.');
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  for(const item of merged){
   if(!fs.readFileSync(path.join(root,item.path)).equals(item.original))throw Error('Router source changed before reconciliation.');
   const backup=path.join(folder,path.basename(item.path)+'.reconciliation-original');
   if(fs.existsSync(backup)){if(fs.lstatSync(backup).isSymbolicLink()||!fs.readFileSync(backup).equals(item.original))throw Error('Existing reconciliation backup differs.');}
   else fs.writeFileSync(backup,item.original,{flag:'wx',mode:0o600});
  }
  // Durable intent and originals precede the normal compatibility transaction.
  writeInstallState(record,{kind:'bridge-router-source-reconciliation',baseSpecHash:hash(JSON.stringify(spec)),files:merged.map(item=>({path:item.path,beforeSha256:hash(item.original),afterSha256:hash(item.patched)}))});
  return {...ensureRouterCompatibility(root,{spec,afterWrite}),reconciled:true,serviceRestarted:false};
 }finally{unlock();}
}
