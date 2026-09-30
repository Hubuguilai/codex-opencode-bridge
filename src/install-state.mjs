import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export function writeInstallState(file,value){
 const temp=file+'.tmp-'+randomUUID();let fd;
 try{
  fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);
 }finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temp,{force:true});}
}
export function acquireInstallLock(root,{name='.installation-lock',alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}}={}){
 if(!/^\.[a-z0-9-]+$/.test(name))throw Error('Invalid installation lock name.');
 const lock=path.join(root,name),ownerFile=path.join(lock,'owner.json');
 try{fs.mkdirSync(lock,{mode:0o700});}catch(error){
  if(error.code!=='EEXIST')throw error;
  if(fs.lstatSync(lock).isSymbolicLink())throw new Error('Installation lock is not a local directory.');
  const reaper=path.join(root,name==='.installation-lock'?'.installation-recovery-lock':name+'-recovery');
  try{fs.mkdirSync(reaper,{mode:0o700});}catch{throw new Error('Another process is inspecting the installation lock; retry shortly.');}
  try{
   let old;try{old=JSON.parse(fs.readFileSync(ownerFile));}catch{throw new Error('Installation lock has no valid owner; inspect it before retrying.');}
   if(!Number.isInteger(old.pid)||old.pid<1||alive(old.pid))throw new Error('Another desktop operation is active; retry after it finishes.');
   if(fs.readdirSync(lock).some(name=>name!=='owner.json'))throw new Error('Stale lock contains unknown files; preserve them before retrying.');
   fs.unlinkSync(ownerFile);fs.rmdirSync(lock);fs.mkdirSync(lock,{mode:0o700});
  }finally{fs.rmdirSync(reaper);}
 }
 const owner={pid:process.pid,id:randomUUID()};writeInstallState(ownerFile,owner);
 return ()=>{
  const current=JSON.parse(fs.readFileSync(ownerFile));
  if(current.id!==owner.id)throw new Error('Installation lock ownership changed.');
  fs.unlinkSync(ownerFile);fs.rmdirSync(lock);
 };
}
