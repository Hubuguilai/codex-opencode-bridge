import fs from 'node:fs';import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {acquireInstallLock} from './install-state.mjs';
const shipped=JSON.parse(fs.readFileSync(new URL('../runtime/router-compatibility.json',import.meta.url)));
const hash=value=>createHash('sha256').update(value).digest('hex');
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Router compatibility files must be regular files.');return stat;}
function directory(file){if(!fs.lstatSync(file).isDirectory()||fs.lstatSync(file).isSymbolicLink())throw Error('Router compatibility directory must not be a symbolic link.');}
function atomic(file,bytes,mode=0o600){const temp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,bytes,{mode,flag:'wx'});fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}}
const save=(file,value)=>atomic(file,JSON.stringify(value,null,2)+'\n');
export function inspectRouterCompatibility(root,{spec=shipped}={}){
 root=path.resolve(root);directory(root);directory(path.join(root,'src'));
 const folder=path.join(root,'.bridge-router-compatibility');directory(folder);
 const recordFile=path.join(folder,'record.json');regular(recordFile);
 const record=JSON.parse(fs.readFileSync(recordFile));
 if(record.kind!=='bridge-router-compatibility'||record.specHash!==hash(JSON.stringify(spec))||record.status!=='installed')throw Error('Router compatibility is incomplete or differs from this release.');
 for(const item of spec.files){
  const file=path.join(root,item.path),backup=path.join(folder,path.basename(item.path)+'.original');regular(file);regular(backup);
  if(hash(fs.readFileSync(file))!==item.afterSha256||hash(fs.readFileSync(backup))!==item.beforeSha256)throw Error('Router compatibility source or backup changed; preserve it for diagnosis.');
 }
 return {id:spec.id,verified:true};
}
// Version-bound, reversible source compatibility. An unknown or edited dependency
// is preserved; no fuzzy patching and no unrecorded developer-machine changes.
export function ensureRouterCompatibility(root,{spec=shipped,afterWrite=()=>{}}={}){
 root=path.resolve(root);directory(root);directory(path.join(root,'src'));
 const folder=path.join(root,'.bridge-router-compatibility'),recordFile=path.join(folder,'record.json');
 if(fs.existsSync(folder))directory(folder);
 else fs.mkdirSync(folder,{mode:0o700});
 const unlock=acquireInstallLock(folder);
 try{
 const specHash=hash(JSON.stringify(spec));
 let record,predecessor;
 if(fs.existsSync(recordFile)){
  regular(recordFile);record=JSON.parse(fs.readFileSync(recordFile));
  if(record.kind!=='bridge-router-compatibility')throw Error('Router compatibility ownership record differs; preserve it for recovery.');
  if(record.specHash!==specHash){
   predecessor=spec.predecessors?.find(x=>x.specHash===record.specHash);
   if(!predecessor||record.status!=='installed')throw Error('Router compatibility ownership record differs; preserve it for recovery.');
  } else if(record.fromSpecHash){
   predecessor=spec.predecessors?.find(x=>x.specHash===record.fromSpecHash);
   if(!predecessor)throw Error('Unrecognized Router compatibility migration.');
  }
 }
 const files=spec.files.map(item=>{
  if(!/^src\/[a-z0-9-]+\.mjs$/.test(item.path))throw Error('Invalid compatibility source path.');
  const file=path.join(root,item.path),stat=regular(file),bytes=fs.readFileSync(file),current=hash(bytes);
  if(record?.specHash!==specHash&&predecessor&&current!==predecessor.files[item.path])throw Error('Previous Router compatibility source changed; migration stopped.');
  if(record?.specHash===specHash&&record.status==='installed'&&current!==item.afterSha256)throw Error('Router source differs from its installed compatibility record.');
  if(current!==item.beforeSha256&&current!==item.afterSha256&&current!==predecessor?.files[item.path])throw Error('Router source differs from the supported compatibility version; no files were changed.');
  if(!record&&current!==item.beforeSha256)throw Error('Router contains an unowned compatibility change; automatic adoption refused.');
  let original=bytes;
  if(record){
   const backup=path.join(folder,path.basename(item.path)+'.original');regular(backup);original=fs.readFileSync(backup);
   if(hash(original)!==item.beforeSha256)throw Error('Router compatibility backup changed; automatic recovery refused.');
  }
  let patched=original.toString('utf8');
  for(const edit of item.edits){if(patched.split(edit.before).length!==2)throw Error('Router compatibility anchor is not unique.');patched=patched.replace(edit.before,edit.after);}
  if(hash(patched)!==item.afterSha256)throw Error('Router compatibility result does not match its manifest.');
  return {...item,file,mode:stat.mode&0o777,current,original,patched};
 });
 if(record?.status==='installed'&&files.every(file=>file.current===file.afterSha256))return {id:spec.id,reused:true};
 if(!record){
  for(const file of files){
   const backup=path.join(folder,path.basename(file.path)+'.original');
   if(fs.existsSync(backup)){regular(backup);if(hash(fs.readFileSync(backup))!==file.beforeSha256)throw Error('Router compatibility backup differs; leaving it unchanged.');}
   else fs.writeFileSync(backup,file.original,{mode:0o600,flag:'wx'});
  }
  record={kind:'bridge-router-compatibility',specHash,id:spec.id,status:'applying'};save(recordFile,record);
 }
 // A durable intent precedes all source edits. Repeat safely finishes a partial
 // application only when every file is still exactly its before/after snapshot.
 if(record.specHash!==specHash){record={kind:'bridge-router-compatibility',specHash,id:spec.id,status:'applying',fromSpecHash:record.specHash};}
 record.status='applying';save(recordFile,record);
 for(const file of files){
  regular(file.file);
  if(hash(fs.readFileSync(file.file))!==file.current)throw Error('Router source changed during compatibility application; retained the recovery record.');
  if(file.current===file.afterSha256)continue;
  atomic(file.file,file.patched,file.mode);afterWrite(file.path);
 }
 record.status='installed';save(recordFile,record);
 return {id:spec.id,reused:false};
 }finally{unlock();}
}
