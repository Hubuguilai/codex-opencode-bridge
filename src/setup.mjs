import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readConfig} from './config.mjs';
const files=['models.json','codex.config.toml','bridge-env.json'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const supported=new Set(['opencode/nemotron-3-ultra-free','opencode/space-bunny-free']);

export function prepareDirectory(directory,{model='opencode/space-bunny-free',catalog,port=4396,upstreamPort=4397}={}){
 const root=path.resolve(directory);
 if(!supported.has(model))throw new Error('Choose a documented model; arbitrary models require separate compatibility validation.');
 if(fs.existsSync(root))throw new Error('Output directory already exists; refusing to overwrite it.');
 const template=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url))).models[0];
 const source=catalog?fs.readFileSync(catalog):null;
 const original=source?JSON.parse(source):{models:[]};
 if(!Array.isArray(original.models))throw new Error('Input catalog must contain a models array.');
 if(original.models.some(entry=>entry.slug===model))throw new Error('Catalog already contains this model ID; refusing to replace its metadata.');
 const label=model.endsWith('space-bunny-free')?'Space Bunny Free':'Nemotron 3 Ultra Free';
 const merged={...original,models:[...original.models,{...template,slug:model,display_name:label+' (OpenCode Bridge)',description:'Experimental OpenCode bridge: text and native client tools; see the tested-model matrix.'}]};
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 try{
  const config=readConfig({BRIDGE_STATE_DIR:path.join(root,'state'),BRIDGE_MODE:'native-tools',BRIDGE_MODELS:model,BRIDGE_PORT:String(port),OPENCODE_PORT:String(upstreamPort)});
  const contents={
   'models.json':JSON.stringify(merged,null,2)+'\n',
   'bridge-env.json':JSON.stringify({BRIDGE_MODE:'native-tools',BRIDGE_MODELS:model,BRIDGE_STATE_DIR:config.stateDir,BRIDGE_PORT:String(port),OPENCODE_PORT:String(upstreamPort)},null,2)+'\n',
   'codex.config.toml':`# Dedicated configuration fragment; do not overwrite your normal Codex configuration.\nmodel_provider = "opencode_bridge"\nmodel = ${JSON.stringify(model)}\nmodel_catalog_json = ${JSON.stringify(path.join(root,'models.json'))}\nmodel_reasoning_effort = "default"\nmodel_reasoning_summary = "none"\nweb_search = "disabled"\n\n[model_providers.opencode_bridge]\nname = "OpenCode Bridge (experimental)"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nenv_key = "BRIDGE_TOKEN"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n\n[features]\napps = false\nmulti_agent = false\n`,
  };
  for(const [name,content]of Object.entries(contents))fs.writeFileSync(path.join(root,name),content,{mode:0o600,flag:'wx'});
  const manifest={project:'codex-opencode-bridge',version:1,model,files:Object.fromEntries(files.map(name=>[name,digest(contents[name])])),sourceCatalogUnchanged:!catalog||fs.readFileSync(catalog).equals(source)};
  fs.writeFileSync(path.join(root,'install-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {directory:root,model,tokenPath:config.tokenPath,catalogPreserved:manifest.sourceCatalogUnchanged};
 }catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
}

export function removePreparedDirectory(directory){
 const root=path.resolve(directory);
 if(fs.lstatSync(root).isSymbolicLink())throw new Error('Refusing a symlinked preparation directory.');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'install-manifest.json')));
 if(manifest.project!=='codex-opencode-bridge'||manifest.version!==1)throw new Error('Not a bridge preparation directory.');
 const expected=new Set([...files,'install-manifest.json','state']);
 if(fs.readdirSync(root).some(name=>!expected.has(name)))throw new Error('Directory contains additional files; preserve them before removal.');
 for(const name of files){const file=path.join(root,name);if(fs.lstatSync(file).isSymbolicLink()||digest(fs.readFileSync(file))!==manifest.files?.[name])throw new Error('Prepared files were modified; refusing to remove user edits.');}
 const state=path.join(root,'state');
 if(fs.lstatSync(state).isSymbolicLink()||fs.readdirSync(state).some(name=>name!=='local-token'))throw new Error('Runtime state is not empty; stop the managed service and inspect leftovers first.');
 fs.rmSync(root,{recursive:true});return {removed:true};
}
