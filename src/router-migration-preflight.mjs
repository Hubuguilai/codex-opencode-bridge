import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const shipped=JSON.parse(fs.readFileSync(new URL('../runtime/router-compatibility.json',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function git(root,args){return spawnSync('git',['-C',root,...args],{encoding:null,maxBuffer:16*1024*1024,timeout:10000});}
// Read-only source reconciliation. A clean merge is not authorization to adopt
// a service or proof that unrelated modifications are behaviorally compatible.
export function routerMigrationPreflight({routerRoot=path.join(os.homedir(),'.local/share/codex-router')}={}, {spec=shipped}={}){
 const root=path.resolve(routerRoot),report={kind:'bridge-router-migration-preflight',readOnly:true,sourceMergeable:false,migrationImplemented:false,checks:[]};
 if(fs.lstatSync(root).isSymbolicLink()||!fs.lstatSync(root).isDirectory())throw Error('Router checkout must be a real directory.');
 const revision=git(root,['rev-parse','HEAD']);
 if(revision.status!==0||revision.stdout.toString().trim()!==spec.upstreamRevision){report.reason='unsupported_base_revision';return report;}
 report.baseRevision=spec.upstreamRevision;report.targetCompatibility=spec.id;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-source-preflight-'));
 try{
  for(const item of spec.files){
   if(!/^src\/[a-z0-9-]+\.mjs$/.test(item.path))throw Error('Invalid compatibility path.');
   const file=path.join(root,item.path),stat=fs.lstatSync(file);
   if(fs.lstatSync(path.join(root,'src')).isSymbolicLink()||stat.isSymbolicLink()||!stat.isFile())throw Error('Compatibility source must be a regular file.');
   const current=fs.readFileSync(file),base=git(root,['show',spec.upstreamRevision+':'+item.path]);
   if(base.status!==0||hash(base.stdout)!==item.beforeSha256)throw Error('Pinned Git source does not match the shipped compatibility manifest.');
   let target=base.stdout.toString();for(const edit of item.edits){if(target.split(edit.before).length!==2)throw Error('Compatibility anchor is not unique.');target=target.replace(edit.before,edit.after);}
   if(hash(target)!==item.afterSha256)throw Error('Compatibility result differs from its manifest.');
   const ours=path.join(temp,'current'),ancestor=path.join(temp,'base'),theirs=path.join(temp,'target');
   for(const [name,bytes] of [[ours,current],[ancestor,base.stdout],[theirs,target]])fs.writeFileSync(name,bytes,{mode:0o600});
   const merged=git(root,['merge-file','--stdout',ours,ancestor,theirs]);
   const unchanged=fs.readFileSync(file).equals(current);
   report.checks.push({file:item.path,locallyModified:hash(current)!==item.beforeSha256,sourcePreserved:unchanged,
    currentSha256:hash(current),mergeable:merged.status===0,...(merged.status===0?{proposedSha256:hash(merged.stdout)}:{reason:'overlapping_changes_or_merge_error'})});
   if(!unchanged)throw Error('Router source changed during preflight; repeat the read-only check.');
  }
  report.sourceMergeable=report.checks.every(x=>x.mergeable&&x.sourcePreserved);
  report.next=report.sourceMergeable?'Source changes can be reconciled. Service ownership, credentials, model overrides, behavioral tests and transactional migration are still required.':'Preserve the installation and resolve source conflicts before migration.';
  return report;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
