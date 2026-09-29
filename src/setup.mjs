import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readConfig} from './config.mjs';
const files=['models.json','codex.config.toml','bridge-env.json'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const supported=new Map([
 ['opencode/space-bunny-free','Space Bunny Free'],
 ['opencode/nemotron-3-ultra-free','Nemotron 3 Ultra Free'],
 ['opencode/mimo-v2.6-flash-free','MiMo V2.6 Flash Free'],
 ['opencode/longcat-2.5-preview-free','LongCat 2.5 Preview Free'],
 ['opencode/big-pickle','Big Pickle'],
]);

export function prepareDirectory(directory,{model,models,catalog,port=4396,upstreamPort=4397}={}){
 const root=path.resolve(directory);
 const selected=models??[model??'opencode/space-bunny-free'];
 if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||selected.some(id=>!supported.has(id)))throw new Error('Choose distinct documented models; arbitrary models require separate compatibility validation.');
 model??=selected[0];
 if(!selected.includes(model))throw new Error('Default model must be included in the prepared models.');
 if(fs.existsSync(root))throw new Error('Output directory already exists; refusing to overwrite it.');
 const template=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url))).models[0];
 const source=catalog?fs.readFileSync(catalog):null;
 const original=source?JSON.parse(source):{models:[]};
 if(!Array.isArray(original.models))throw new Error('Input catalog must contain a models array.');
 if(original.models.some(entry=>selected.includes(entry.slug)))throw new Error('Catalog already contains a selected model ID; refusing to replace its metadata.');
 const merged={...original,models:[...original.models,...selected.map(id=>({...template,slug:id,display_name:supported.get(id)+' (OpenCode Bridge)',description:'Experimental text and client tools; client-alias workflow tested. 32k is a test budget, not the model maximum.'}))]};
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 try{
  const bridgeEnv={BRIDGE_STATE_DIR:path.join(root,'state'),BRIDGE_MODE:'native-tools',BRIDGE_INTERNAL_TOOLS:'client-aliases',BRIDGE_TOOL_TRANSPORT:'direct',BRIDGE_MODELS:selected.join(','),BRIDGE_PORT:String(port),OPENCODE_PORT:String(upstreamPort)};
  const config=readConfig(bridgeEnv);
  const contents={
   'models.json':JSON.stringify(merged,null,2)+'\n',
   'bridge-env.json':JSON.stringify(bridgeEnv,null,2)+'\n',
   'codex.config.toml':`# Dedicated configuration fragment; do not overwrite your normal Codex configuration.\nmodel_provider = "opencode_bridge"\nmodel = ${JSON.stringify(model)}\nmodel_catalog_json = ${JSON.stringify(path.join(root,'models.json'))}\nmodel_reasoning_effort = "default"\nmodel_reasoning_summary = "none"\nweb_search = "disabled"\n\n[model_providers.opencode_bridge]\nname = "OpenCode Bridge (experimental)"\nbase_url = "http://127.0.0.1:${port}/v1"\nwire_api = "responses"\nenv_key = "BRIDGE_TOKEN"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n\n[features]\napps = false\nmulti_agent = false\n`,
  };
  for(const [name,content]of Object.entries(contents))fs.writeFileSync(path.join(root,name),content,{mode:0o600,flag:'wx'});
  const manifest={project:'codex-opencode-bridge',version:1,model,models:selected,files:Object.fromEntries(files.map(name=>[name,digest(contents[name])])),sourceCatalogUnchanged:!catalog||fs.readFileSync(catalog).equals(source)};
  fs.writeFileSync(path.join(root,'install-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
  return {directory:root,model,models:selected,tokenPath:config.tokenPath,catalogPreserved:manifest.sourceCatalogUnchanged};
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

export function preparedEnvironment(directory,env=process.env){
 const root=path.resolve(directory);
 if(fs.lstatSync(root).isSymbolicLink())throw new Error('Refusing a symlinked preparation directory.');
 const manifestFile=path.join(root,'install-manifest.json');
 if(!fs.lstatSync(manifestFile).isFile()||fs.lstatSync(manifestFile).isSymbolicLink())throw new Error('Invalid preparation manifest.');
 const manifest=JSON.parse(fs.readFileSync(manifestFile));
 if(manifest.project!=='codex-opencode-bridge'||manifest.version!==1)throw new Error('Not a bridge preparation directory.');
 for(const name of files){
  const file=path.join(root,name),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||digest(fs.readFileSync(file))!==manifest.files?.[name])throw new Error('Prepared files were modified; create a new preparation or use explicit serve settings.');
 }
 const saved=JSON.parse(fs.readFileSync(path.join(root,'bridge-env.json')));
 const keys=['BRIDGE_STATE_DIR','BRIDGE_MODE','BRIDGE_INTERNAL_TOOLS','BRIDGE_TOOL_TRANSPORT','BRIDGE_MODELS','BRIDGE_PORT','OPENCODE_PORT'];
 if(Object.keys(saved).length!==keys.length||keys.some(key=>typeof saved[key]!=='string'))throw new Error('Invalid prepared environment; regenerate the preparation.');
 const models=manifest.models??[manifest.model];
 if(!Array.isArray(models)||!models.length||models.some(id=>!supported.has(id))||new Set(models).size!==models.length||!models.includes(manifest.model)||saved.BRIDGE_MODELS!==models.join(','))throw new Error('Prepared model selection does not match its manifest.');
 if(saved.BRIDGE_STATE_DIR!==path.join(root,'state')||saved.BRIDGE_MODE!=='native-tools'||saved.BRIDGE_INTERNAL_TOOLS!=='client-aliases'||saved.BRIDGE_TOOL_TRANSPORT!=='direct')throw new Error('Prepared settings are inconsistent or moved; regenerate the preparation.');
 const state=path.join(root,'state'),token=path.join(state,'local-token');
 if(fs.lstatSync(state).isSymbolicLink()||!fs.lstatSync(state).isDirectory()||fs.lstatSync(token).isSymbolicLink()||!fs.lstatSync(token).isFile())throw new Error('Prepared state and token must be local regular files/directories.');
 // Inherited route/token/limits must not silently change a reviewed preparation.
 // Keep the runtime executable, provider credentials and network environment.
 return {...Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('BRIDGE_')&&key!=='OPENCODE_PORT')),...saved};
}
