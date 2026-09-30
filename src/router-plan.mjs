import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preparedEnvironment} from './setup.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=value=>value.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/-{2,}/g,'-').replace(/^-|-$/g,'');

// Export only. Never import a router runtime, read its secrets, or edit its state.
export function prepareRouterPlan(directory,{prepared,routerState}={}){
 if(!prepared||!routerState)throw new Error('Provide the prepared bridge and explicit router state directories.');
 const root=path.resolve(directory),bridgeRoot=path.resolve(prepared),state=path.resolve(routerState);
 if(fs.existsSync(root))throw new Error('Plan output already exists; refusing to overwrite it.');
 const env=preparedEnvironment(bridgeRoot,{}),port=Number(env.BRIDGE_PORT);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid prepared bridge port.');
 const models=env.BRIDGE_MODELS.split(','),providerId='opencode-native-bridge';
 const sources={};
 const read=(name,field)=>{
  const file=path.join(state,name);const bytes=fs.readFileSync(file);const payload=JSON.parse(bytes);
  if(!Array.isArray(payload[field]))throw new Error('Invalid router document: '+name);
  sources[name]={path:file,sha256:sha(bytes)};return payload;
 };
 const providers=read('generic-providers.json','providers');
 const users=read('user-models.json','models');
 const catalog=read('merged-models.json','models');
 if(providers.providers.some(x=>x.id===providerId))throw new Error('The new provider ID already exists; refusing to replace it.');
 const preparedCatalog=JSON.parse(fs.readFileSync(path.join(bridgeRoot,'models.json')));
 const additions=routerModelsFromCatalog(models,preparedCatalog);
 if(additions.some(({entry})=>users.models.some(x=>x.slug===entry.slug||x.gatewayModel===entry.gatewayModel)||catalog.models.some(x=>x.slug===entry.slug)))throw new Error('A proposed model identity already exists.');
 const provider={id:providerId,displayName:'OpenCode Native Bridge',baseUrl:`http://127.0.0.1:${port}/v1`,adapter:'openai-responses',headers:{},allowPrivate:true,enabled:true};
 const plan={version:1,kind:'codex-opencode-router-plan',applied:false,bridgePreparation:bridgeRoot,routerState:state,sources,provider,credentialSource:{kind:'local-file',path:path.join(bridgeRoot,'state','local-token')},models:additions.map(x=>x.entry),requiredActivation:['Start the prepared bridge.','Register this separate provider and its local token using the installed router credential store.','Append the proposed user-model entries without replacing unrelated entries.','Use the router shared publication/service path for all installed clients.','Fully quit and reopen Codex, then verify the actual picker and a real tool task.'],checks:{existingCatalogEntriesPreserved:true,existingUserModelsPreserved:true,credentialsCopied:false,activeConfigurationModified:false,desktopPickerVerified:false}};
 const menu={...catalog,models:[...catalog.models,...additions.map(x=>x.catalog)]};
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 try{
  for(const [name,value]of Object.entries({'router-plan.json':plan,'menu-preview.json':menu,'user-model-additions.json':{version:1,models:plan.models},'provider-addition.json':provider}))fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
  const labels=additions.map(x=>'- '+x.entry.displayName).join('\n');
  fs.writeFileSync(path.join(root,'REVIEW.md'),`# Desktop integration review\n\nThis is a plan, not a live installation.\n\n## New picker entries\n\n${labels}\n\nExisting catalog entries: ${catalog.models.length}; proposed total: ${menu.models.length}. Existing entries are retained verbatim and in their existing order.\n\nProvider: ${providerId}; endpoint: ${provider.baseUrl}; Responses passthrough. The token remains in the prepared bridge directory and is not copied into this plan.\n\nBefore applying, check source file hashes in router-plan.json for drift. Keep the existing provider routes, native GPT/login and old prototype intact. Publish through the installed router's shared path, then fully quit and reopen Codex. Application restart and actual picker verification have not occurred.\n`,{mode:0o600,flag:'wx'});
  return {directory:root,providerId,existingModels:catalog.models.length,addedModels:additions.length,totalModels:menu.models.length,applied:false};
 }catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
}

export function routerModelsFromCatalog(models,preparedCatalog){
 const providerId='opencode-native-bridge';
 return models.map((id,index)=>{
  const source=preparedCatalog.models.find(x=>x.slug===id);
  if(!source)throw new Error('Prepared model missing from catalog.');
  const slug=providerId+'/'+id,gatewayModel=safe(providerId)+'-'+safe(id);
  const displayName=source.display_name.replace(/ \(OpenCode Bridge\)$/,'')+' (OpenCode Native Bridge)';
  const description=source.description+'; official OpenCode bridge. Provider access and quotas apply.';
  const entry={slug,gatewayModel,compHash:gatewayModel+'-user-v1',upstreamModel:id,provider:providerId,listed:true,displayName,description,priority:100+index,contextWindow:source.context_window,autoCompact:source.auto_compact_token_limit??26000,inputModalities:source.input_modalities??['text'],defaultEffort:'default',reasoningLevels:[{effort:'default',description:'Upstream default'}],supportsReasoningSummaries:false,supportedEndpoints:['/responses']};
  // Keep capability claims tied to this model; do not spend a second model's
  // access to synthesize vision for text-only bridge routes.
  entry.visionBridge=false;
  return {entry,catalog:{...source,slug,display_name:displayName,description,priority:100+index}};
 });
}
