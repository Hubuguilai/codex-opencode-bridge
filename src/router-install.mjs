import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const pin=JSON.parse(fs.readFileSync(new URL('../runtime/router.json',import.meta.url)));
const marker='.bridge-router-install.json';
const save=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
export function runDependency(command,args,{cwd,env=process.env,timeout=600000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-65536);});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-65536);});
  const kill=signal=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
  let escalation;
  const timer=setTimeout(()=>{kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),5000);},timeout);
  child.once('error',error=>{clearTimeout(timer);clearTimeout(escalation);reject(error);});
  child.once('close',status=>{clearTimeout(timer);clearTimeout(escalation);resolve({status,stdout,stderr});});
 });
}
export async function ensureRouter(directory=path.join(os.homedir(),'.local/share/codex-router'),
 {run=runDependency,env=process.env,platform=process.platform}={}){
 if(platform!=='darwin')throw new Error('Automatic Router installation currently targets macOS.');
 const root=path.resolve(directory),record=path.join(root,marker);
 if(fs.existsSync(root)){
  if(fs.lstatSync(root).isSymbolicLink())throw new Error('Use the real Router installation path, not a symbolic link.');
  if(fs.existsSync(record)){
   const saved=JSON.parse(fs.readFileSync(record));
   if(saved.kind!=='bridge-managed-router'||saved.status!=='installed')throw new Error('Managed Router installation is incomplete; inspect its local record before retrying.');
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  if(manifest.name!==pin.packageName||!fs.existsSync(path.join(root,'src/model-overlay-publication.mjs')))throw new Error('Existing directory is not a compatible Codex Router; leaving it unchanged.');
  return {root,reused:true,managed:fs.existsSync(record)};
 }
 const parent=path.dirname(root);fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const stage=fs.mkdtempSync(path.join(parent,'.bridge-router-download-'));
 let moved=false;
 const execute=async(cmd,args,cwd)=>{
  const result=await run(cmd,args,{cwd,env});
  if(result.status!==0)throw new Error(`Router dependency step failed: ${cmd} ${args[0]}. Check Git/npm/network access; credentials and command output were not printed.`);
  return result;
 };
 try{
  await execute('git',['init','--quiet'],stage);
  await execute('git',['remote','add','origin',pin.repository],stage);
  await execute('git',['fetch','--depth=1','origin',pin.revision],stage);
  await execute('git',['checkout','--detach','FETCH_HEAD'],stage);
  const actual=(await execute('git',['rev-parse','HEAD'],stage)).stdout.trim();
  if(actual!==pin.revision)throw new Error('Downloaded Router revision did not match the pinned revision.');
  const pkg=JSON.parse(fs.readFileSync(path.join(stage,'package.json')));
  if(pkg.name!==pin.packageName)throw new Error('Downloaded Router package identity mismatch.');
  if(fs.existsSync(root))throw new Error('Router destination appeared during download; leaving it unchanged.');
  fs.renameSync(stage,root);moved=true;
  const receipt={kind:'bridge-managed-router',status:'installing',revision:pin.revision,phase:'node-dependencies'};save(record,receipt);
  await execute('npm',['ci','--omit=dev','--no-audit','--no-fund'],root);
  receipt.phase='router-setup';save(record,receipt);
  // Use the pinned upstream installer. It owns client-config backup/rollback;
  // no extra providers are selected and existing login files are not rewritten.
  await execute(process.execPath,['src/setup.mjs','--auto','--no-provider','--no-tray','--adopt-native-catalog'],root);
  receipt.phase='ready';receipt.status='installed';save(record,receipt);
  return {root,reused:false,managed:true,revision:pin.revision};
 }catch(error){
  if(moved){const receipt=JSON.parse(fs.readFileSync(record));receipt.status='incomplete';save(record,receipt);}
  throw error;
 }finally{if(!moved)fs.rmSync(stage,{recursive:true,force:true});}
}
