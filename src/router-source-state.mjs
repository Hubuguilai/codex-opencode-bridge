import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const compatibility=JSON.parse(fs.readFileSync(new URL('../runtime/router-compatibility.json',import.meta.url)));
const hash=value=>createHash('sha256').update(value).digest('hex');
export function captureRouterSource(root){
 const files={};
 const visit=relative=>{
  const file=path.join(root,relative),stat=fs.lstatSync(file);
  if(stat.isSymbolicLink())throw Error('Downloaded Router source contains a symbolic link.');
  if(stat.isDirectory())for(const child of fs.readdirSync(file).sort())visit(path.join(relative,child));
  else if(stat.isFile())files[relative]=hash(fs.readFileSync(file));
  else throw Error('Downloaded Router source contains an unsupported file.');
 };
 for(const name of fs.readdirSync(root).sort())if(name!=='.git')visit(name);
 if(!files['package.json']||!files['src/model-overlay-publication.mjs'])throw Error('Downloaded Router source is incomplete.');
 return files;
}
export function verifyRouterSource(root,files){
 if(!files||typeof files!=='object'||Array.isArray(files)||!files['package.json'])throw Error('Router preparation has no complete source receipt; preserve it for diagnosis.');
 for(const [relative,expected]of Object.entries(files)){
  if(path.isAbsolute(relative)||relative.split(path.sep).some(x=>x==='..'||x===''))throw Error('Invalid Router source receipt path.');
  let current=root;
  for(const part of relative.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Router source was replaced by a symbolic link.');}
  if(!fs.statSync(current).isFile())throw Error('Router source is not a regular file.');
  const actual=hash(fs.readFileSync(current));
  const patch=compatibility.files.find(x=>x.path===relative&&x.beforeSha256===expected);
  if(actual!==expected&&actual!==patch?.afterSha256&&!compatibility.predecessors?.some(x=>patch&&x.files[relative]===actual))throw Error('Router source changed after download; preserving it instead of rerunning installation.');
 }
 return true;
}
