import fs from 'node:fs';
import {modelProfile,modelCatalogEntry} from './model-profiles.mjs';
import {routerModelsFromCatalog} from './router-plan.mjs';
import {inspectLegacyRouterRoute,regularToken} from './legacy-router-route.mjs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fingerprint=x=>hash(JSON.stringify(x));
const planArtifacts=['user-model-additions.json','menu-preview.json','REVIEW.md'];
const artifactHashes=root=>Object.fromEntries(planArtifacts.map(name=>{const file=path.join(root,name);if(fs.lstatSync(file).isSymbolicLink())throw Error('Model plan artifacts must not be symbolic links.');return [name,hash(fs.readFileSync(file))];}));
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
 const publish=async options=>{
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
 publish.restoring=()=>{forward=false;};
 return publish;
}
export async function registerRouter(directory,options={}){return registerRouterRoute(directory,options,false);}
// Internal route transaction only. A desktop migration coordinator must first
// validate source compatibility and new-service health, and retain the old service.
export async function adoptLegacyRouterRoute(directory,options={}){return registerRouterRoute(directory,options,true);}
async function registerRouterRoute(directory,{api,restart=true}={},adopt){
 const root=path.resolve(directory),plan=readPlan(root),record=path.join(root,'registration.json');
 if(path.resolve(api.paths.STATE_DIR)!==path.resolve(plan.routerState))fail('Selected Router uses a different state directory than this plan.');
 if((adopt&&!plan.legacyAdoption)||(!adopt&&plan.legacyAdoption&&!fs.existsSync(record)))fail('Use the explicit legacy route adoption operation for an adoption plan.');
 let reused=false;
 const tokenPath=api.secrets.genericProviderCredentialPath(plan.provider.id);
 const publication=checkedPublication(api,{present:plan.models.map(x=>x.slug)});
 await api.overlay.transactModelOverlayMutation({restart,applyPublication:publication,
  capture:()=>{
   const snapshots=api.overlay.captureModelOverlayFiles(files(api,tokenPath,record));
   // Durable private pre-mutation backup; never printed or committed.
   const backup=path.join(root,'backups');fs.mkdirSync(backup,{recursive:true,mode:0o700});
   save(path.join(backup,`${Date.now()}-${randomUUID()}.json`),snapshots);return snapshots;
  },
  restore:snapshots=>{publication.restoring();return api.overlay.restoreModelOverlayFiles(snapshots);},
  mutate:()=>{
   if(fs.existsSync(record)){
    const receipt=JSON.parse(fs.readFileSync(record));
    if(receipt.kind!=='bridge-router-registration'||receipt.planHash!==fingerprint(plan))fail('Installation record differs from this plan.');
    validateOwned(api,receipt);reused=true;return;
   }
   for(const source of Object.values(plan.sources)){
    if(hash(fs.readFileSync(source.path))!==source.sha256)fail('Router settings changed since preparation; regenerate the integration plan.');
   }
   if(adopt){
    const observed=inspectLegacyRouterRoute(api,{legacyTokenPath:plan.legacyAdoption.legacyTokenPath});
    if(fingerprint(observed)!==fingerprint(plan.legacyAdoption))fail('Legacy route or credential changed; inspect it again before adoption.');
    if(regularToken(plan.credentialSource.path).token!==regularToken(tokenPath).token)fail('Prepared service must preserve the legacy local credential.');
   }
   if(!adopt&&(api.providers.readGenericProviders().some(x=>x.id===plan.provider.id)||fs.existsSync(tokenPath)))fail('Provider or credential already exists; leaving it unchanged.');
   const allUsers=api.users.readUserModels(),users=adopt?allUsers.filter(x=>x.provider!==plan.provider.id):allUsers;
   if(plan.models.some(x=>users.some(y=>x.slug===y.slug||x.gatewayModel===y.gatewayModel)))fail('Model identity already exists.');
   const token=fs.readFileSync(plan.credentialSource.path,'utf8').trim();
   if(token.length<24||/\s/.test(token))fail('Invalid local bridge credential.');
   if(!adopt)api.secrets.writeGenericProviderCredential(plan.provider.id,token);
   const credential=adopt?api.credentials.readProviderCredentialStore().credentials.find(x=>x.id===plan.legacyAdoption.credentialId):api.credentials.addGenericProviderCredentialReference({providerId:plan.provider.id,kind:'api_key',secretRef:{type:'provider-file',providerId:plan.provider.id},label:'Local OpenCode bridge'});
   if(adopt)api.providers.updateGenericProvider(plan.provider.id,{baseUrl:plan.provider.baseUrl});
   else api.providers.addGenericProvider({...plan.provider,credentialRef:credential.id});
   api.users.writeUserModels([...users,...plan.models]);
   api.picker.setModelsVisible(plan.models.map(x=>x.slug),true);
   save(record,{kind:'bridge-router-registration',planHash:fingerprint(plan),providerId:plan.provider.id,
    providerHash:fingerprint(api.providers.getGenericProvider(plan.provider.id)),credentialId:credential.id,credentialHash:fingerprint(credential),
    tokenPath,tokenHash:hash(fs.readFileSync(tokenPath)),artifactHashes:artifactHashes(root),modelHashes:Object.fromEntries(plan.models.map(x=>[x.slug,fingerprint(x)]))});
  }});
 return {registered:true,reused,...(adopt?{legacyRouteAdopted:true,serviceMigrationComplete:false}:{}),models:plan.models.map(x=>x.displayName),restartCodexRequired:true};
}
export async function unregisterRouter(directory,{api,restart=true}={}){
 const root=path.resolve(directory),plan=readPlan(root),record=path.join(root,'registration.json');
 if(path.resolve(api.paths.STATE_DIR)!==path.resolve(plan.routerState))fail('Selected Router uses a different state directory than this plan.');
 if(!fs.existsSync(record))return {removed:true,alreadyAbsent:true};
 const receipt=JSON.parse(fs.readFileSync(record));
 if(receipt.kind!=='bridge-router-registration'||receipt.planHash!==fingerprint(plan))fail('Invalid registration record.');
 const publication=checkedPublication(api,{absent:Object.keys(receipt.modelHashes)});
 await api.overlay.transactModelOverlayMutation({restart,applyPublication:publication,files:files(api,receipt.tokenPath,record),restore:snapshots=>{publication.restoring();return api.overlay.restoreModelOverlayFiles(snapshots);},mutate:()=>{
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

// Changes only this registration's model entries. The desktop coordinator must
// separately update/restart the bridge allowlist before treating this as usable.
export async function updateRouterModels(directory,{models,api,restart=true,restoreSelection}={}){
 if(restoreSelection)models=JSON.parse(restoreSelection['router-plan.json']).models.map(x=>x.upstreamModel);
 if(!Array.isArray(models)||!models.length||new Set(models).size!==models.length||models.some(id=>!modelProfile(id)))fail('Choose distinct supported model IDs; use uninstall to remove the entire bridge.');
 const root=path.resolve(directory),planFile=path.join(root,'router-plan.json'),plan=readPlan(root),recordFile=path.join(root,'registration.json');
 if(path.resolve(api.paths.STATE_DIR)!==path.resolve(plan.routerState))fail('Selected Router uses a different state directory than this plan.');
 const receipt=JSON.parse(fs.readFileSync(recordFile));
 if(receipt.kind!=='bridge-router-registration'||receipt.planHash!==fingerprint(plan))fail('Invalid registration record.');
 const template=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url))).models[0];
 const additions=routerModelsFromCatalog(models,{models:models.map(id=>modelCatalogEntry(id,template,plan.modelOverrides?.[id]))});
 let entries=additions.map(x=>x.entry);
 if(restoreSelection){
  const oldPlan=JSON.parse(restoreSelection['router-plan.json']),oldReceipt=JSON.parse(restoreSelection['registration.json']);
  if(oldReceipt.planHash!==fingerprint(oldPlan)||['providerId','providerHash','credentialId','credentialHash','tokenPath','tokenHash'].some(key=>oldReceipt[key]!==receipt[key]))fail('Saved model selection does not belong to this provider.');
  for(const name of planArtifacts)if(hash(restoreSelection[name])!==oldReceipt.artifactHashes?.[name])fail('Saved model artifacts failed integrity checks.');
  if(oldPlan.models.some(x=>fingerprint(x)!==oldReceipt.modelHashes?.[x.slug]))fail('Saved models failed integrity checks.');
  entries=oldPlan.models;
 }
 const slugs=entries.map(x=>x.slug),oldSlugs=Object.keys(receipt.modelHashes),removed=oldSlugs.filter(x=>!slugs.includes(x));
 const artifacts=['router-plan.json','user-model-additions.json','menu-preview.json','REVIEW.md'].map(name=>path.join(root,name));
 const publication=checkedPublication(api,{present:slugs,absent:removed});
 await api.overlay.transactModelOverlayMutation({restart,applyPublication:publication,
  capture:()=>{
   const snapshot=api.overlay.captureModelOverlayFiles([...files(api,receipt.tokenPath,recordFile),...artifacts]);
   const backup=path.join(root,'backups');fs.mkdirSync(backup,{recursive:true,mode:0o700});
   save(path.join(backup,`models-${Date.now()}-${randomUUID()}.json`),snapshot);return snapshot;
  },restore:snapshot=>{publication.restoring();return api.overlay.restoreModelOverlayFiles(snapshot);},mutate:()=>{
   // Re-read under Router's mutation lock: another bridge operation must not
   // invalidate the record captured before we acquired that lock.
   if(fingerprint(JSON.parse(fs.readFileSync(recordFile)))!==fingerprint(receipt)||fingerprint(readPlan(root))!==fingerprint(plan))fail('Registration changed while waiting for its lock; retry after the other operation.');
   if(!receipt.artifactHashes||fingerprint(artifactHashes(root))!==fingerprint(receipt.artifactHashes))fail('Model plan artifacts were edited or lack ownership hashes; preserve them before updating.');
   const users=validateOwned(api,receipt),unrelated=users.filter(x=>!oldSlugs.includes(x.slug));
   if(entries.some(x=>unrelated.some(y=>x.slug===y.slug||x.gatewayModel===y.gatewayModel)))fail('A requested model identity belongs to another registration.');
   const nextPlan={...plan,models:entries};
   api.users.writeUserModels([...unrelated,...entries]);
   api.picker.forgetModelVisibility(removed);api.picker.setModelsVisible(slugs,true);
   save(planFile,nextPlan);save(path.join(root,'user-model-additions.json'),{version:1,models:entries});
   const catalog=JSON.parse(fs.readFileSync(api.paths.MERGED_CATALOG_PATH));
   save(path.join(root,'menu-preview.json'),{...catalog,models:[...catalog.models.filter(x=>!oldSlugs.includes(x.slug)),...additions.map(x=>x.catalog)]});
   fs.writeFileSync(path.join(root,'REVIEW.md'),'# Registered bridge model selection\n\n'+entries.map(x=>'- '+x.displayName).join('\n')+'\n\nThis selection updates Router entries only. Desktop activation and live bridge model access require separate verification. Previous configuration is retained in private backups.\n',{mode:0o600});
   save(recordFile,{...receipt,planHash:fingerprint(nextPlan),artifactHashes:artifactHashes(root),modelHashes:Object.fromEntries(entries.map(x=>[x.slug,fingerprint(x)]))});
   if(restoreSelection)for(const name of ['router-plan.json','registration.json',...planArtifacts])fs.writeFileSync(path.join(root,name),restoreSelection[name],{mode:0o600});
  }});
 return {updated:true,models,providerAndCredentialsPreserved:true,bridgeAllowlistUpdated:false,restartCodexRequired:true};
}

export function captureRouterSelection(directory){
 return Object.fromEntries(['router-plan.json','registration.json',...planArtifacts].map(name=>{const file=path.join(directory,name);if(fs.lstatSync(file).isSymbolicLink())fail('Model plan must not contain symbolic links.');return [name,fs.readFileSync(file,'utf8')];}));
}
export function verifyRouterSelection(directory,{api}){
 const plan=readPlan(directory),receipt=JSON.parse(fs.readFileSync(path.join(directory,'registration.json')));
 if(path.resolve(api.paths.STATE_DIR)!==path.resolve(plan.routerState)||receipt.kind!=='bridge-router-registration'||receipt.planHash!==fingerprint(plan))fail('Invalid model registration ownership.');
 validateOwned(api,receipt);
 if(!receipt.artifactHashes||fingerprint(artifactHashes(directory))!==fingerprint(receipt.artifactHashes))fail('Model plan artifacts were edited or lack ownership hashes.');
 return {verified:true};
}
