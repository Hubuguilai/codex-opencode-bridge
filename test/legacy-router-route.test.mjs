import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {prepareDirectory} from '../src/setup.mjs';
import {prepareRouterPlan,routerModelsFromCatalog} from '../src/router-plan.mjs';
import {inspectLegacyRouterRoute} from '../src/legacy-router-route.mjs';
import {captureLegacyRouteRecovery,restoreLegacyRouterRoute} from '../src/legacy-route-recovery.mjs';
import {registerRouter,adoptLegacyRouterRoute,verifyRouterSelection} from '../src/router-registration.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-route-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const state=path.join(root,'router'),prepared=path.join(root,'prepared'),out=path.join(root,'plan');fs.mkdirSync(state);
 const id='opencode-native-bridge',models=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'];
 const modelOverrides=Object.fromEntries(models.map(id=>[id,{contextWindow:1048576,autoCompact:891289}]));
 prepareDirectory(prepared,{models,modelOverrides,port:4496});
 const tokenFile=path.join(state,'token'),legacyTokenPath=path.join(root,'old-token'),token=fs.readFileSync(path.join(prepared,'state/local-token'));
 fs.writeFileSync(tokenFile,token,{mode:0o600});fs.writeFileSync(legacyTokenPath,token,{mode:0o600});
 const write=(name,v)=>fs.writeFileSync(path.join(state,name),JSON.stringify(v)),read=name=>JSON.parse(fs.readFileSync(path.join(state,name)));
 const credential={id:'cred_fixture',providerId:id,kind:'api_key',secretRef:{type:'provider-file',providerId:id}};
 const provider={id,displayName:'Legacy label',baseUrl:'http://127.0.0.1:4396/v1',adapter:'openai-responses',enabled:true,allowPrivate:true,headers:{},credentialRef:credential.id};
 const owned=routerModelsFromCatalog(models,JSON.parse(fs.readFileSync(path.join(prepared,'models.json')))).map(x=>{delete x.entry.bridgeStrictImages;delete x.entry.visionBridge;return x.entry;});
 const unrelated={slug:'other/model',provider:'other',gatewayModel:'other-model',custom:'keep'};
 write('generic-providers.json',{providers:[provider,{id:'other'}]});write('user-models.json',{models:[unrelated,...owned]});write('credentials.json',{credentials:[credential,{id:'other_credential'}]});write('picker.json',{keep:true});write('merged-models.json',{models:[{slug:'gpt-native',visibility:'list'},...owned]});
 const api={paths:{STATE_DIR:state,MERGED_CATALOG_PATH:path.join(state,'merged-models.json'),PROVIDER_CREDENTIAL_STORE_PATH:path.join(state,'credentials.json')},
 providers:{GENERIC_PROVIDERS_PATH:path.join(state,'generic-providers.json'),getGenericProvider:id=>read('generic-providers.json').providers.find(x=>x.id===id),readGenericProviders:()=>read('generic-providers.json').providers,updateGenericProvider:(id,patch)=>write('generic-providers.json',{providers:read('generic-providers.json').providers.map(x=>x.id===id?{...x,...patch}:x)})},
 users:{USER_MODELS_PATH:path.join(state,'user-models.json'),readUserModels:()=>read('user-models.json').models,writeUserModels:models=>write('user-models.json',{models})},
 credentials:{readProviderCredentialStore:()=>read('credentials.json')},secrets:{genericProviderCredentialPath:()=>tokenFile},
 picker:{MODEL_PICKER_STATE_PATH:path.join(state,'picker.json'),setModelsVisible:slugs=>{if(!slugs.length)throw Error('At least one model slug is required.');write('picker.json',{keep:true,visible:slugs});}},overlay:{}};
 api.overlay.captureModelOverlayFiles=files=>files.map(file=>({file,bytes:fs.existsSync(file)?fs.readFileSync(file).toString('base64'):null}));
 api.overlay.restoreModelOverlayFiles=rows=>{for(const {file,bytes} of rows)if(bytes===null)fs.rmSync(file,{force:true});else fs.writeFileSync(file,Buffer.from(bytes,'base64'));};
 api.overlay.applyModelOverlayPublication=async()=>write('merged-models.json',{models:[{slug:'gpt-native',visibility:'list'},...api.users.readUserModels().map(x=>({...x,visibility:'list'}))]});
 api.overlay.transactModelOverlayMutation=async({capture,files,mutate,restore=api.overlay.restoreModelOverlayFiles,applyPublication})=>{const before=capture?capture():api.overlay.captureModelOverlayFiles(files);try{await mutate();await applyPublication({});}catch(error){await restore(before);await applyPublication({});throw error;}};
 api.picker.modelPickerSnapshot=()=>({hidden:[],visible:owned.map(x=>x.slug),seeded:owned.map(x=>x.slug)});
 api.picker.forgetModelVisibility=()=>{};
 const legacy=inspectLegacyRouterRoute(api,{legacyTokenPath});
 const makePlan=()=>prepareRouterPlan(out,{prepared,routerState:state,legacy});
 return {root,state,out,api,legacy,makePlan,prepared,tokenFile,token,unrelated,credential,write,read};
}
test('Explicit legacy adoption preserves credentials/context/unrelated state and supports managed reuse',async t=>{
 const f=fixture(t);f.makePlan();const beforeCredentials=fs.readFileSync(f.api.paths.PROVIDER_CREDENTIAL_STORE_PATH);
 await assert.rejects(registerRouter(f.out,{api:f.api,restart:false}),/explicit legacy/);
 const result=await adoptLegacyRouterRoute(f.out,{api:f.api,restart:false});assert.equal(result.legacyRouteAdopted,true);assert.equal(result.serviceMigrationComplete,false);
 assert.equal(f.api.providers.getGenericProvider('opencode-native-bridge').baseUrl,JSON.parse(fs.readFileSync(path.join(f.out,'router-plan.json'))).provider.baseUrl);
 assert.equal(f.api.providers.getGenericProvider('opencode-native-bridge').displayName,'Legacy label');
 assert.deepEqual(fs.readFileSync(f.api.paths.PROVIDER_CREDENTIAL_STORE_PATH),beforeCredentials);assert.deepEqual(fs.readFileSync(f.tokenFile),f.token);
 assert.deepEqual(f.api.users.readUserModels()[0],f.unrelated);
 assert.ok(f.api.users.readUserModels().slice(1).every(x=>x.contextWindow===1048576&&x.autoCompact===891289&&x.bridgeStrictImages===true&&x.visionBridge===false));
 assert.equal(verifyRouterSelection(f.out,{api:f.api}).verified,true);
 assert.equal((await adoptLegacyRouterRoute(f.out,{api:f.api,restart:false})).reused,true);
 assert.equal((await registerRouter(f.out,{api:f.api,restart:false})).reused,true);
 assert.ok(fs.readdirSync(path.join(f.out,'backups')).length>=1);
 assert.equal(JSON.stringify(f.legacy).includes(f.token.toString().trim()),false);
});
test('Legacy inspection and adoption reject credential mismatch, symlinks, and drift',async t=>{
 const f=fixture(t);f.makePlan();fs.writeFileSync(f.tokenFile,'different-valid-test-token-1234567890');
 await assert.rejects(adoptLegacyRouterRoute(f.out,{api:f.api,restart:false}),/credentials do not match/);
 assert.equal(fs.existsSync(path.join(f.out,'registration.json')),false);
 fs.writeFileSync(f.tokenFile,f.token);fs.unlinkSync(f.legacy.legacyTokenPath);fs.symlinkSync(f.tokenFile,f.legacy.legacyTokenPath);
 assert.throws(()=>inspectLegacyRouterRoute(f.api,{legacyTokenPath:f.legacy.legacyTokenPath}),/regular file/);
});
test('Adoption publication failure restores old route, profiles, picker, credential and ownership absence',async t=>{
 const f=fixture(t);f.makePlan();const files=[f.api.providers.GENERIC_PROVIDERS_PATH,f.api.users.USER_MODELS_PATH,f.api.picker.MODEL_PICKER_STATE_PATH,f.api.paths.PROVIDER_CREDENTIAL_STORE_PATH,f.tokenFile];
 const before=files.map(file=>fs.readFileSync(file));const publish=f.api.overlay.applyModelOverlayPublication;let once=true;
 f.api.overlay.applyModelOverlayPublication=async options=>{await publish(options);if(once){once=false;throw Error('Injected publication failure');}};
 await assert.rejects(adoptLegacyRouterRoute(f.out,{api:f.api,restart:false}),/Injected/);
 files.forEach((file,i)=>assert.deepEqual(fs.readFileSync(file),before[i]));assert.equal(fs.existsSync(path.join(f.out,'registration.json')),false);
 assert.equal((await adoptLegacyRouterRoute(f.out,{api:f.api,restart:false}).catch(e=>({message:e.message}))).message?.includes('changed since preparation'),true);
 // Publication can reformat the catalog during rollback. Fresh inspection/plan
 // is intentionally required instead of bypassing source drift checks.
});
test('Adoption refuses changed context preferences and added legacy models',t=>{
 const f=fixture(t),different=path.join(f.root,'different');prepareDirectory(different,{models:Object.keys(f.legacy.modelOverrides)});
 assert.throws(()=>prepareRouterPlan(f.out,{prepared:different,routerState:f.state,legacy:f.legacy}),/context preferences/);assert.equal(fs.existsSync(f.out),false);
 f.write('user-models.json',{models:[...f.api.users.readUserModels(),{slug:'unexpected',provider:'opencode-native-bridge'}]});
 assert.throws(f.makePlan,/model set changed/);
});

test('Semantic legacy rollback recovers a partial provider-only cutover and preserves unrelated edits',async t=>{
 const f=fixture(t);f.makePlan();const recovery=captureLegacyRouteRecovery(f.out,{api:f.api});
 const plan=JSON.parse(fs.readFileSync(path.join(f.out,'router-plan.json')));
 f.api.providers.updateGenericProvider('opencode-native-bridge',{baseUrl:plan.provider.baseUrl});
 f.api.users.writeUserModels([...f.api.users.readUserModels(),{slug:'other/later',provider:'other',gatewayModel:'later'}]);
 assert.equal((await restoreLegacyRouterRoute(f.out,{api:f.api,recovery,restart:false})).restored,true);
 assert.equal(f.api.providers.getGenericProvider('opencode-native-bridge').baseUrl,recovery.provider.baseUrl);
 assert.ok(f.api.users.readUserModels().some(x=>x.slug==='other/later'));
 assert.equal((await restoreLegacyRouterRoute(f.out,{api:f.api,recovery,restart:false})).restored,true);
});
test('Semantic legacy rollback restores completed adoption but refuses unknown adopted edits',async t=>{
 const f=fixture(t);f.makePlan();const recovery=captureLegacyRouteRecovery(f.out,{api:f.api});await adoptLegacyRouterRoute(f.out,{api:f.api,restart:false});
 assert.equal((await restoreLegacyRouterRoute(f.out,{api:f.api,recovery,restart:false})).restored,true);assert.equal(fs.existsSync(path.join(f.out,'registration.json')),false);
 f.api.providers.updateGenericProvider('opencode-native-bridge',{baseUrl:'http://127.0.0.1:1234/v1'});
 await assert.rejects(restoreLegacyRouterRoute(f.out,{api:f.api,recovery,restart:false}),/unknown changes/);
});
