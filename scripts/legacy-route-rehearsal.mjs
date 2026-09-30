// Actual pinned Router APIs, isolated state, no services or model inference.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
if(!process.env.BRIDGE_LEGACY_REHEARSAL_CHILD){
 if(!process.argv[2])throw Error('Usage: node scripts/legacy-route-rehearsal.mjs ROUTER_DIRECTORY');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-legacy-route-rehearsal-'));
 const child=spawnSync(process.execPath,[process.argv[1],path.resolve(process.argv[2])],{env:{...process.env,BRIDGE_LEGACY_REHEARSAL_CHILD:root,CODEX_HOME:path.join(root,'codex'),MODEL_ROUTER_STATE_DIR:path.join(root,'state'),MODEL_ROUTER_USER_MODELS:path.join(root,'state/user-models.json'),CODEX_ROUTER_NO_DISCOVERY:'0'},encoding:'utf8',timeout:120000});
 process.stdout.write(child.stdout??'');process.stderr.write((child.stderr??'').slice(-2000));
 if(child.status===0)fs.rmSync(root,{recursive:true,force:true});
 process.exit(child.status??1);
}
// Only the native-login probe is synthetic; publication and state transactions
// use the actual Router. No real account credentials enter this fixture.
const probe=path.join(process.env.BRIDGE_LEGACY_REHEARSAL_CHILD,'codex-probe');
fs.writeFileSync(probe,'#!'+process.execPath+'\nif(process.argv.includes("--version"))console.log("codex-cli 0.131.0");else if(process.argv.slice(2).join(" ")==="login status")console.log("Logged in using ChatGPT");else process.exit(1);\n',{mode:0o700});process.env.CODEX_BIN=probe;
const {loadRouter,registerRouter,adoptLegacyRouterRoute,verifyRouterSelection}=await import('../src/router-registration.mjs');
const {inspectLegacyRouterRoute}=await import('../src/legacy-router-route.mjs');
const {prepareDirectory}=await import('../src/setup.mjs');
const {prepareRouterPlan,routerModelsFromCatalog}=await import('../src/router-plan.mjs');
const root=process.env.BRIDGE_LEGACY_REHEARSAL_CHILD,api=await loadRouter(process.argv[2]),state=api.paths.STATE_DIR;
assert.equal(path.resolve(state),path.join(root,'state'));fs.mkdirSync(state,{recursive:true});fs.mkdirSync(process.env.CODEX_HOME,{recursive:true});
const models=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'],id='opencode-native-bridge';
const modelOverrides=Object.fromEntries(models.map(id=>[id,{contextWindow:1048576,autoCompact:891289}]));
const prepared=path.join(root,'prepared');prepareDirectory(prepared,{models,modelOverrides,port:4496});
const localToken=path.join(prepared,'state/local-token');api.secrets.writeGenericProviderCredential(id,fs.readFileSync(localToken,'utf8'));
const credential=api.credentials.addGenericProviderCredentialReference({providerId:id,kind:'api_key',secretRef:{type:'provider-file',providerId:id},label:'Legacy rehearsal local token'});
api.providers.addGenericProvider({id,displayName:'Legacy label',baseUrl:'http://127.0.0.1:4396/v1',adapter:'openai-responses',enabled:true,allowPrivate:true,headers:{},credentialRef:credential.id});
const owned=routerModelsFromCatalog(models,JSON.parse(fs.readFileSync(path.join(prepared,'models.json')))).map(x=>{delete x.entry.visionBridge;delete x.entry.bridgeStrictImages;return x.entry;});api.users.writeUserModels(owned);
const native=JSON.parse(fs.readFileSync(new URL('../examples/native-models.json',import.meta.url)));native.models=[{...native.models[0],slug:'gpt-native-sentinel',display_name:'Native sentinel'}];
const source=path.join(root,'native.json');fs.writeFileSync(source,JSON.stringify(native));fs.writeFileSync(api.paths.NATIVE_CATALOG_SOURCE_PATH,JSON.stringify({version:1,path:source,status:'active'}));fs.writeFileSync(path.join(state,'native-models.json'),JSON.stringify(native));
await api.overlay.applyModelOverlayPublication({restart:false});
const receipt={date:new Date().toISOString(),isolatedState:true,realRouterApis:true,nativeAuthProbe:'synthetic signed-in CLI fixture; no real account',servicesRestarted:false,modelRequests:0,checks:{}};
const inspect=()=>inspectLegacyRouterRoute(api,{legacyTokenPath:localToken});
const out=path.join(root,'plan');prepareRouterPlan(out,{prepared,routerState:state,legacy:inspect()});
const before=fs.readFileSync(api.paths.PROVIDER_CREDENTIAL_STORE_PATH),beforeToken=fs.readFileSync(api.secrets.genericProviderCredentialPath(id));
const publish=api.overlay.applyModelOverlayPublication;let once=true;
const failing={...api,overlay:{...api.overlay,applyModelOverlayPublication:async options=>{await publish(options);if(once){once=false;throw Error('Injected legacy publication failure');}}}};
await assert.rejects(adoptLegacyRouterRoute(out,{api:failing,restart:false}),/Injected legacy publication failure/);
assert.equal(api.providers.getGenericProvider(id).baseUrl,'http://127.0.0.1:4396/v1');assert.deepEqual(api.users.readUserModels(),owned);assert.equal(fs.existsSync(path.join(out,'registration.json')),false);receipt.checks.publicationFailureRestored=true;
const fresh=path.join(root,'fresh');prepareRouterPlan(fresh,{prepared,routerState:state,legacy:inspect()});
assert.equal((await adoptLegacyRouterRoute(fresh,{api,restart:false})).legacyRouteAdopted,true);
assert.notEqual(api.providers.getGenericProvider(id).baseUrl,'http://127.0.0.1:4396/v1');assert.equal(api.providers.getGenericProvider(id).baseUrl,JSON.parse(fs.readFileSync(path.join(fresh,'router-plan.json'))).provider.baseUrl);
assert.equal(verifyRouterSelection(fresh,{api}).verified,true);receipt.checks.adoptedAndOwned=true;
assert.equal((await registerRouter(fresh,{api,restart:false})).reused,true);receipt.checks.managedRepeat=true;
assert.deepEqual(fs.readFileSync(api.paths.PROVIDER_CREDENTIAL_STORE_PATH),before);assert.deepEqual(fs.readFileSync(api.secrets.genericProviderCredentialPath(id)),beforeToken);receipt.checks.credentialPreserved=true;
assert.ok(api.users.readUserModels().every(x=>x.contextWindow===1048576&&x.autoCompact===891289&&x.bridgeStrictImages&&x.visionBridge===false));receipt.checks.contextAndStrictImagesPreserved=true;
const catalog=JSON.parse(fs.readFileSync(api.paths.MERGED_CATALOG_PATH));assert.ok(catalog.models.some(x=>x.slug==='gpt-native-sentinel'));assert.equal(fs.readFileSync(source,'utf8'),JSON.stringify(native));receipt.checks.nativeSourcePreserved=true;
receipt.scope='Route transaction only; no service cutover, process-crash recovery, GUI or inference acceptance.';
fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/legacy-route-rehearsal.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
