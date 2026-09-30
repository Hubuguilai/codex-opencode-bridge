import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {modelProfile} from './model-profiles.mjs';
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function regularToken(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Legacy bridge credential must be a regular file.');
 const bytes=fs.readFileSync(file),token=bytes.toString().trim();
 if(token.length<24||/\s/.test(token))throw Error('Invalid legacy local bridge credential.');
 return {bytes,token};
}
// Read-only ownership evidence. Contains hashes and model preferences, never the
// local token. This does not authorize or manage the old background service.
export function inspectLegacyRouterRoute(api,{legacyTokenPath}={}){
 const providerId='opencode-native-bridge',provider=api.providers.getGenericProvider(providerId);
 if(!provider||provider.adapter!=='openai-responses'||!provider.enabled||!provider.allowPrivate||Object.keys(provider.headers??{}).length)throw Error('Unsupported legacy bridge provider configuration.');
 const url=new URL(provider.baseUrl);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/v1'||url.username||url.password||url.search||url.hash)throw Error('Legacy bridge must use an explicit loopback Responses endpoint.');
 const credential=api.credentials.readProviderCredentialStore().credentials.find(x=>x.id===provider.credentialRef);
 if(!credential||credential.providerId!==providerId||credential.kind!=='api_key'||credential.secretRef?.type!=='provider-file'||credential.secretRef.providerId!==providerId)throw Error('Legacy provider must own an explicit local credential reference.');
 const tokenPath=api.secrets.genericProviderCredentialPath(providerId),local=regularToken(tokenPath);
 if(!legacyTokenPath||regularToken(legacyTokenPath).token!==local.token)throw Error('Legacy service and Router credentials do not match.');
 const models=api.users.readUserModels().filter(x=>x.provider===providerId);
 if(!models.length||new Set(models.map(x=>x.slug)).size!==models.length||models.some(x=>!modelProfile(x.upstreamModel)||x.slug!==providerId+'/'+x.upstreamModel||!Number.isSafeInteger(x.contextWindow)||!Number.isSafeInteger(x.autoCompact)||x.autoCompact<1||x.autoCompact>=x.contextWindow))throw Error('Legacy model set or context preferences require manual reconciliation.');
 return {kind:'bridge-legacy-route-snapshot',routerState:path.resolve(api.paths.STATE_DIR),providerId,providerHash:fingerprint(provider),baseUrl:provider.baseUrl,
  credentialId:credential.id,credentialHash:fingerprint(credential),tokenPath,tokenHash:createHash('sha256').update(local.bytes).digest('hex'),
  legacyTokenPath:path.resolve(legacyTokenPath),modelHashes:Object.fromEntries(models.map(x=>[x.slug,fingerprint(x)])),
  modelOverrides:Object.fromEntries(models.map(x=>[x.upstreamModel,{contextWindow:x.contextWindow,autoCompact:x.autoCompact}]))};
}
export function verifyLegacyPlan(legacy,{provider,models,routerState}){
 if(legacy?.kind!=='bridge-legacy-route-snapshot'||legacy.routerState!==path.resolve(routerState)||legacy.providerId!==provider?.id||legacy.providerHash!==fingerprint(provider))throw Error('Legacy provider snapshot does not match Router state.');
 const owned=models.filter(x=>x.provider===legacy.providerId);
 if(fingerprint(Object.fromEntries(owned.map(x=>[x.slug,fingerprint(x)])))!==fingerprint(legacy.modelHashes))throw Error('Legacy model set changed since inspection.');
}
