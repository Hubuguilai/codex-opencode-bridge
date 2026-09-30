import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {preparedEnvironment} from './setup.mjs';
import {modelProfile,modelCatalogEntry} from './model-profiles.mjs';
const names=['models.json','codex.config.toml','bridge-env.json','install-manifest.json'];
const hash=x=>createHash('sha256').update(x).digest('hex');
export function validateModels(models){
 if(!Array.isArray(models)||!models.length||new Set(models).size!==models.length||models.some(id=>!modelProfile(id)))throw Error('Choose distinct supported model IDs; use uninstall to remove all models.');
}
export function planModelSelection(directory,models){
 validateModels(models);const env=preparedEnvironment(directory,{});
 const before=Object.fromEntries(names.map(name=>[name,fs.readFileSync(path.join(directory,name),'utf8')]));
 const manifest=JSON.parse(before['install-manifest.json']),catalog=JSON.parse(before['models.json']);
 const template=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url))).models[0];
 const old=manifest.models??[manifest.model];
 if(catalog.models.some(x=>!old.includes(x.slug)&&models.includes(x.slug)))throw Error('A requested model already exists outside this managed selection.');
 const nextCatalog={...catalog,models:[...catalog.models.filter(x=>!old.includes(x.slug)),...models.map(id=>modelCatalogEntry(id,template,manifest.modelOverrides?.[id]))]};
 const nextEnv={...env,BRIDGE_MODELS:models.join(','),BRIDGE_IMAGE_MODELS:models.filter(id=>modelProfile(id).images).join(',')};
 const after={'models.json':JSON.stringify(nextCatalog,null,2)+'\n','bridge-env.json':JSON.stringify(nextEnv,null,2)+'\n',
 'codex.config.toml':before['codex.config.toml'].replace(/^model = .*$/m,'model = '+JSON.stringify(models[0]))};
 after['install-manifest.json']=JSON.stringify({...manifest,model:models[0],models,files:Object.fromEntries(Object.entries(after).map(([name,bytes])=>[name,hash(bytes)]))},null,2)+'\n';
 return {before,after,tokenHash:hash(fs.readFileSync(path.join(directory,'state/local-token')))};
}
export function validateSelectionFiles(directory,selection){
 if(fs.lstatSync(directory).isSymbolicLink())throw Error('Preparation must not be a symbolic link.');
 for(const version of [selection.before,selection.after])if(!version||Object.keys(version).sort().join('|')!==[...names].sort().join('|')||names.some(name=>typeof version[name]!=='string'))throw Error('Invalid model-change file record.');
 for(const name of names){
  const file=path.join(directory,name);
  if(fs.lstatSync(file).isSymbolicLink())throw Error('Model configuration was replaced by a symbolic link.');
  const current=fs.readFileSync(file,'utf8');
  if(current!==selection.before[name]&&current!==selection.after[name])throw Error('Model configuration was edited outside this change; preserve edits before recovery.');
 }
 if(fs.lstatSync(path.join(directory,'state')).isSymbolicLink()||fs.lstatSync(path.join(directory,'state/local-token')).isSymbolicLink())throw Error('Credential storage was replaced by a symbolic link.');
 if(hash(fs.readFileSync(path.join(directory,'state/local-token')))!==selection.tokenHash)throw Error('Local credential changed; model recovery stopped.');
}
export function writeSelectionFiles(directory,selection,version){
 if(!['before','after'].includes(version))throw Error('Invalid selection version.');
 validateSelectionFiles(directory,selection);
 // The desktop journal is durable before these individually atomic writes.
 // Recovery recognizes either version of each file after an interrupted batch.
 for(const name of names){
  const target=path.join(directory,name),temp=target+'.tmp-'+randomUUID();let fd;
  try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,selection[version][name]);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,target);}
  finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(temp,{force:true});}
 }
 preparedEnvironment(directory,{});
}
