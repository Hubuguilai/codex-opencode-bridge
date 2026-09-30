import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fingerprint=x=>hash(JSON.stringify(x));
const fail=x=>{throw new Error(x);};
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});

// Import only an explicitly selected installation. State identity is checked
// before mutation; do not redirect a loaded Router module through env changes.
export async function loadRouter(root){
 const get=name=>import(pathToFileURL(path.join(path.resolve(root),'src',name+'.mjs')).href);
 const [providers,users,picker,credentials,secrets,overlay,paths]=await Promise.all([
  get('generic-providers'),get('user-models'),get('model-picker-state'),get('provider-credential-store'),get('provider-credentials'),get('model-overlay-publication'),get('paths')]);
 return {providers,users,picker,credentials,secrets,overlay,paths};
}
function readPlan(directory){
 const plan=JSON.parse(fs.readFileSync(path.join(directory,'router-plan.json')));
 if(plan.version!==1||plan.kind!=='codex-opencode-router-plan'||!Array.isArray(plan.models)||!plan.models.length||!plan.provider?.id)fail('Invalid bridge Router plan.');
 return plan;
}
function files(api,tokenPath,record){return [api.providers.GENERIC_PROVIDERS_PATH,api.users.USER_MODELS_PATH,api.picker.MODEL_PICKER_STATE_PATH,api.paths.PROVIDER_CREDENTIAL_STORE_PATH,tokenPath,record];}
function validateOwned(api,receipt){
 const provider=api.providers.getGenericProvider(receipt.providerId);
 if(fingerprint(provider)!==receipt.providerHash)fail('Registered provider was edited; preserve changes before removing it.');
 const users=api.users.readUserModels();
 if(users.some(x=>x.provider===receipt.providerId&&!Object.hasOwn(receipt.modelHashes,x.slug)))fail('Additional models use this provider; preserve or migrate them before removal.');
 const credential=api.credentials.readProviderCredentialStore().credentials.find(x=>x.id===receipt.credentialId);
 if(fingerprint(credential??null)!==receipt.credentialHash)fail('Credential reference was edited; automatic removal stopped.');
 for(const [slug,expected] of Object.entries(receipt.modelHashes)){
  if(fingerprint(users.find(x=>x.slug===slug)??null)!==expected)fail('Registered model was edited or removed; automatic removal stopped.');
 }
 if(hash(fs.readFileSync(receipt.tokenPath))!==receipt.tokenHash)fail('Managed credential changed; automatic removal stopped.');
 return users;
}
// Verify the forward publication while still inside Router's rollback boundary.
// A rollback publication restores the old catalog and must not be checked against
// the failed new model set.
export function checkedPublication(api,{present=[],absent=[]}={}){
 let forward=true;
 return async options=>{
  const verify=forward;forward=false;
  const result=await api.overlay.applyModelOverlayPublication(options);
  if(verify){
   const catalog=JSON.parse(fs.readFileSync(api.paths.MERGED_CATALOG_PATH));
   if(!Array.isArray(catalog.models))fail('Published model catalog is invalid.');
   const visible=new Set(catalog.models.filter(x=>x.visibility==='list').map(x=>x.slug));
   if(present.some(slug=>!visible.has(slug)))fail('Router publication omitted a requested model. Check provider readiness, discovery mode and picker visibility; registration was not accepted.');
   const all=new Set(catalog.models.map(x=>x.slug));
   if(absent.some(slug=>all.has(slug)))fail('Removed models remain in the published catalog; removal was not accepted.');
  }
  return result;
 };
}
export async function registerRouter(directory,{api,restart=true}={}){
 const root=path.resolve(directory),plan=readPlan(root),record=path.join(root,'registration.json');
 if(path.resolve(api.paths.STATE_DIR)!==path.resolve(plan.routerState))fail('Selected Router uses a different state directory than this plan.');
 let reused=false;
 const tokenPath=api.secrets.genericProviderCredentialPath(plan.provider.id);
 await api.overlay.transactModelOverlayMutation({restart,applyPublication:checkedPublication(api,{present:plan.models.map(x=>x.slug)}),
  capture:()=>{
   const snapshots=api.overlay.captureModelOverlayFiles(files(api,tokenPath,record));
   // Durable private pre-mutation backup; never printed or committed.
   const backup=path.join(root,'backups');fs.mkdirSync(backup,{recursive:true,mode:0o700});
   save(path.join(backup,`${Date.now()}-${process.pid}.json`),snapshots);return snapshots;
  },
  restore:snapshots=>api.overlay.restoreModelOverlayFiles(snapshots),
  mutate:()=>{
   if(fs.existsSync(record)){
    const receipt=JSON.parse(fs.readFileSync(record));
    if(receipt.kind!=='bridge-router-registration'||receipt.planHash!==fingerprint(plan))fail('Installation record differs from this plan.');
    validateOwned(api,receipt);reused=true;return;
   }
   for(const source of Object.values(plan.sources)){
    if(hash(fs.readFileSync(source.path))!==source.sha256)fail('Router settings changed since preparation; regenerate the integration plan.');
   }
   if(api.providers.readGenericProviders().some(x=>x.id===plan.provider.id)||fs.existsSync(tokenPath))fail('Provider or credential already exists; leaving it unchanged.');
   const users=api.users.readUserModels();
   if(plan.models.some(x=>users.some(y=>x.slug===y.slug||x.gatewayModel===y.gatewayModel)))fail('Model identity already exists.');
   const token=fs.readFileSync(plan.credentialSource.path,'utf8').trim();
   if(token.length<24||/\s/.test(token))fail('Invalid local bridge credential.');
   api.secrets.writeGenericProviderCredential(plan.provider.id,token);
   const credential=api.credentials.addGenericProviderCredentialReference({providerId:plan.provider.id,kind:'api_key',secretRef:{type:'provider-file',providerId:plan.provider.id},label:'Local OpenCode bridge'});
   api.providers.addGenericProvider({...plan.provider,credentialRef:credential.id});
   api.users.writeUserModels([...users,...plan.models]);
   api.picker.setModelsVisible(plan.models.map(x=>x.slug),true);
   save(record,{kind:'bridge-router-registration',planHash:fingerprint(plan),providerId:plan.provider.id,
    providerHash:fingerprint(api.providers.getGenericProvider(plan.provider.id)),credentialId:credential.id,credentialHash:fingerprint(credential),
    tokenPath,tokenHash:hash(fs.readFileSync(tokenPath)),modelHashes:Object.fromEntries(plan.models.map(x=>[x.slug,fingerprint(x)]))});
  }});
 return {registered:true,reused,models:plan.models.map(x=>x.displayName),restartCodexRequired:true};
}
export async function unregisterRouter(directory,{api,restart=true}={}){
 const root=path.resolve(directory),plan=readPlan(root),record=path.join(root,'registration.json');
 if(path.resolve(api.paths.STATE_DIR)!==path.resolve(plan.routerState))fail('Selected Router uses a different state directory than this plan.');
 if(!fs.existsSync(record))return {removed:true,alreadyAbsent:true};
 const receipt=JSON.parse(fs.readFileSync(record));
 if(receipt.kind!=='bridge-router-registration'||receipt.planHash!==fingerprint(plan))fail('Invalid registration record.');
 await api.overlay.transactModelOverlayMutation({restart,applyPublication:checkedPublication(api,{absent:Object.keys(receipt.modelHashes)}),files:files(api,receipt.tokenPath,record),mutate:()=>{
  const users=validateOwned(api,receipt),slugs=Object.keys(receipt.modelHashes);
  api.users.writeUserModels(users.filter(x=>!slugs.includes(x.slug)));
  api.picker.forgetModelVisibility(slugs);
  api.providers.removeGenericProvider(receipt.providerId);
  api.credentials.removeCredentialReference(receipt.credentialId);
  // Remove precisely the owned file; leave alternate credentials untouched.
  fs.unlinkSync(receipt.tokenPath);fs.unlinkSync(record);
 }});
 return {removed:true,unrelatedModelsPreserved:true,backupsPreserved:true,restartCodexRequired:true};
}
