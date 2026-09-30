import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {inspectLegacyRouterRoute} from './legacy-router-route.mjs';
import {checkedPublication} from './router-registration.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),fingerprint=x=>hash(JSON.stringify(x));
const readPlan=directory=>JSON.parse(fs.readFileSync(path.join(directory,'router-plan.json')));
export function captureLegacyRouteRecovery(directory,{api}={}){
 const plan=readPlan(directory),legacy=plan.legacyAdoption;
 if(!legacy||fingerprint(inspectLegacyRouterRoute(api,{legacyTokenPath:legacy.legacyTokenPath}))!==fingerprint(legacy))throw Error('Legacy route changed before recovery capture.');
 return {kind:'bridge-legacy-route-recovery',planHash:fingerprint(plan),legacy,provider:api.providers.getGenericProvider(legacy.providerId),models:api.users.readUserModels().filter(x=>x.provider===legacy.providerId),picker:api.picker.modelPickerSnapshot()};
}
// Semantic rollback touches only the adopted provider/models. Unrelated changes
// since a crash survive; unknown edits to the adopted route stop recovery.
export async function restoreLegacyRouterRoute(directory,{api,recovery,restart=true}={}){
 const plan=readPlan(directory),old=recovery,record=path.join(directory,'registration.json');
 if(old?.kind!=='bridge-legacy-route-recovery'||old.planHash!==fingerprint(plan)||old.legacy.routerState!==path.resolve(api.paths.STATE_DIR)||plan.provider.id!==old.legacy.providerId)throw Error('Legacy route recovery does not belong to this plan.');
 const id=old.legacy.providerId,slugs=old.models.map(x=>x.slug),targetProvider={...old.provider,baseUrl:plan.provider.baseUrl};
 if(fingerprint(old.provider)!==old.legacy.providerHash||fingerprint(Object.fromEntries(old.models.map(x=>[x.slug,fingerprint(x)])))!==fingerprint(old.legacy.modelHashes))throw Error('Legacy recovery originals failed integrity checks.');
 const publication=checkedPublication(api);
 await api.overlay.transactModelOverlayMutation({restart,applyPublication:publication,files:[api.providers.GENERIC_PROVIDERS_PATH,api.users.USER_MODELS_PATH,api.picker.MODEL_PICKER_STATE_PATH,record],mutate:()=>{
  const provider=api.providers.getGenericProvider(id),users=api.users.readUserModels(),owned=users.filter(x=>x.provider===id);
  if(![fingerprint(old.provider),fingerprint(targetProvider)].includes(fingerprint(provider)))throw Error('Adopted provider has unknown changes; recovery stopped.');
  if(owned.length!==slugs.length||owned.some(x=>!slugs.includes(x.slug)||![old.models.find(y=>y.slug===x.slug),plan.models.find(y=>y.slug===x.slug)].some(y=>y&&fingerprint(y)===fingerprint(x))))throw Error('Adopted models have unknown changes; recovery stopped.');
  const credential=api.credentials.readProviderCredentialStore().credentials.find(x=>x.id===old.legacy.credentialId);
  if(fingerprint(credential)!==old.legacy.credentialHash||hash(fs.readFileSync(old.legacy.tokenPath))!==old.legacy.tokenHash)throw Error('Legacy credential changed; recovery stopped.');
  if(fs.existsSync(record)){
   const receipt=JSON.parse(fs.readFileSync(record));
   if(receipt.kind!=='bridge-router-registration'||receipt.planHash!==old.planHash||receipt.providerHash!==fingerprint(targetProvider)||receipt.tokenHash!==old.legacy.tokenHash||receipt.credentialHash!==old.legacy.credentialHash||fingerprint(receipt.modelHashes)!==fingerprint(Object.fromEntries(plan.models.map(x=>[x.slug,fingerprint(x)]))))throw Error('Adoption record changed; recovery stopped.');
   fs.unlinkSync(record);
  }
  api.providers.updateGenericProvider(id,{baseUrl:old.provider.baseUrl});
  api.users.writeUserModels(users.map(x=>x.provider===id?old.models.find(y=>y.slug===x.slug):x));
  api.picker.forgetModelVisibility(slugs);
  const visible=slugs.filter(x=>old.picker.visible.includes(x)),hidden=slugs.filter(x=>old.picker.hidden.includes(x));
  if(visible.length)api.picker.setModelsVisible(visible,true);
  if(hidden.length)api.picker.setModelsVisible(hidden,false);
 }});
 return {restored:true,unrelatedEntriesPreserved:true};
}
