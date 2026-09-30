import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const roots=['bin','examples','package.json','runtime','src'];
const marker='bridge-release.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(root,{saved=false}={}){
 const files={};
 function visit(relative){
  const full=path.join(root,relative),stat=fs.lstatSync(full);
  if(stat.isSymbolicLink())throw Error('Release files must not contain symbolic links.');
  if(stat.isDirectory())for(const name of fs.readdirSync(full).sort())visit(path.join(relative,name));
  else if(stat.isFile())files[relative]=fs.readFileSync(full);
  else throw Error('Release contains a non-regular file.');
 }
 if(fs.lstatSync(root).isSymbolicLink())throw Error('Release directory must not be a symbolic link.');
 if(saved){
  for(const name of fs.readdirSync(root).sort())if(name!==marker)visit(name);
 }else for(const name of roots)visit(name);
 return files;
}
const manifestFor=files=>Object.fromEntries(Object.keys(files).sort().map(name=>[name,hash(files[name])]));
const identity=manifest=>hash(JSON.stringify(manifest));
export function verifyRelease(directory){
 const root=path.resolve(directory),recordFile=path.join(root,marker);
 if(fs.lstatSync(root).isSymbolicLink()||fs.lstatSync(recordFile).isSymbolicLink())throw Error('Release ownership record must not be a symbolic link.');
 let record;try{record=JSON.parse(fs.readFileSync(recordFile));}catch{throw Error('Release ownership record is unreadable.');}
 const manifest=manifestFor(inventory(root,{saved:true})),id=identity(manifest);
 if(record.kind!=='bridge-code-release'||record.id!==id||path.basename(root)!==id||JSON.stringify(record.files)!==JSON.stringify(manifest))throw Error('Managed release changed; preserving it and refusing to start modified code.');
 return {id,directory:root,cli:path.join(root,'bin/bridge.mjs')};
}
// Called under the desktop installation lock. Snapshot only shipped runtime
// assets, never state, credentials, developer dependencies or generated output.
export function stageRelease(directory,{source=sourceRoot}={}){
 const base=path.resolve(directory);
 if(fs.existsSync(base)&&fs.lstatSync(base).isSymbolicLink())throw Error('Releases directory must not be a symbolic link.');
 const files=inventory(path.resolve(source)),manifest=manifestFor(files),id=identity(manifest);
 const target=path.join(base,id);
 fs.mkdirSync(base,{recursive:true,mode:0o700});
 if(fs.existsSync(target))return {...verifyRelease(target),reused:true};
 const temporary=path.join(base,'.staging-'+randomUUID());
 fs.mkdirSync(temporary,{mode:0o700});
 try{
  for(const [name,bytes] of Object.entries(files)){
   const file=path.join(temporary,name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
   fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  }
  fs.writeFileSync(path.join(temporary,marker),JSON.stringify({kind:'bridge-code-release',id,files:manifest},null,2)+'\n',{flag:'wx',mode:0o600});
  // Compare the captured bytes again before publication. No service points at
  // this staging directory; rename publishes the complete release together.
  if(identity(manifestFor(inventory(temporary,{saved:true})))!==id)throw Error('Release copy failed verification.');
  fs.renameSync(temporary,target);
  return {...verifyRelease(target),reused:false};
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
