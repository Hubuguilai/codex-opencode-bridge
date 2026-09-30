import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const regular=file=>{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Reconciliation evidence must be a regular file.');return fs.readFileSync(file);};
// Recompute the compatibility overlay from the pinned Git ancestor and protected
// original user source. A record cannot substitute arbitrary patched bytes.
export function reconciledRouterSpec(root,spec){
 const folder=path.join(root,'.bridge-router-compatibility'),file=path.join(folder,'reconciliation.json');
 if(!fs.existsSync(file))return spec;
 if(fs.lstatSync(folder).isSymbolicLink())throw Error('Reconciliation directory must not be a symbolic link.');
 const record=JSON.parse(regular(file));
 if(record.kind!=='bridge-router-source-reconciliation'||record.baseSpecHash!==hash(JSON.stringify(spec))||!Array.isArray(record.files)||record.files.length!==spec.files.length)throw Error('Reconciled Router requires its matching compatibility version; preserve its source before upgrading.');
 const git=args=>spawnSync('git',['-C',root,...args],{encoding:null,maxBuffer:16*1024*1024,timeout:10000});
 const revision=git(['rev-parse','HEAD']);if(revision.status!==0||revision.stdout.toString().trim()!==spec.upstreamRevision)throw Error('Reconciled Router Git baseline changed.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-reconciled-spec-'));
 try{
  const files=spec.files.map((item,index)=>{
   const saved=record.files[index];
   if(saved.path!==item.path||!/^src\/[a-z0-9-]+\.mjs$/.test(item.path))throw Error('Reconciliation source set changed.');
   const original=regular(path.join(folder,path.basename(item.path)+'.reconciliation-original'));
   if(hash(original)!==saved.beforeSha256)throw Error('Reconciliation original changed.');
   const base=git(['show',spec.upstreamRevision+':'+item.path]);
   if(base.status!==0||hash(base.stdout)!==item.beforeSha256)throw Error('Reconciliation Git ancestor differs from the pinned source.');
   let target=base.stdout.toString();for(const edit of item.edits){if(target.split(edit.before).length!==2)throw Error('Compatibility anchor is not unique.');target=target.replace(edit.before,edit.after);}
   if(hash(target)!==item.afterSha256)throw Error('Reconciliation target differs from the compatibility manifest.');
   for(const [name,bytes]of [['ours',original],['base',base.stdout],['target',target]])fs.writeFileSync(path.join(temp,name),bytes,{mode:0o600});
   const merged=git(['merge-file','--stdout',...['ours','base','target'].map(name=>path.join(temp,name))]);
   if(merged.status!==0||hash(merged.stdout)!==saved.afterSha256)throw Error('Reconciliation cannot reproduce the recorded merge.');
   return {...item,beforeSha256:saved.beforeSha256,afterSha256:saved.afterSha256,edits:[{before:original.toString(),after:merged.stdout.toString()}]};
  });
  return {...spec,id:spec.id+'+preserved-local-source',predecessors:[],files};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
