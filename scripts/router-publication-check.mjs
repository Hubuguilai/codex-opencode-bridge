import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
if(!process.env.BRIDGE_PUBLICATION_CHILD){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-publication-'));
 const router=process.argv[2];if(!router)throw Error('Provide an explicit Router source directory.');
 const result=spawnSync(process.execPath,[process.argv[1],router],{env:{...process.env,BRIDGE_PUBLICATION_CHILD:'1',CODEX_HOME:path.join(root,'codex'),MODEL_ROUTER_STATE_DIR:path.join(root,'state'),MODEL_ROUTER_USER_MODELS:path.join(root,'state/user-models.json'),CODEX_ROUTER_NO_DISCOVERY:'0'},encoding:'utf8',timeout:90000});
 console.log(result.stdout);console.log(result.stderr.slice(-1200));if(result.status===0)fs.rmSync(root,{recursive:true,force:true});process.exit(result.status??1);
}
const {prepareDirectory}=await import('../src/setup.mjs');const {prepareRouterPlan}=await import('../src/router-plan.mjs');
const {loadRouter,registerRouter,unregisterRouter}=await import('../src/router-registration.mjs');
const api=await loadRouter(process.argv[2]);const state=api.paths.STATE_DIR;fs.mkdirSync(state,{recursive:true});fs.mkdirSync(process.env.CODEX_HOME,{recursive:true});
fs.writeFileSync(path.join(state,'generic-providers.json'),JSON.stringify({version:1,providers:[]}));
api.users.writeUserModels([]);
fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify({models:[]}));
const native=JSON.parse(fs.readFileSync('examples/native-models.json'));native.models=[{...native.models[0],slug:'gpt-native-sentinel',display_name:'Native sentinel'}];
const originalCatalog=path.join(path.dirname(state),'user-native-models.json');fs.writeFileSync(originalCatalog,JSON.stringify(native));
fs.writeFileSync(api.paths.NATIVE_CATALOG_SOURCE_PATH,JSON.stringify({version:1,path:originalCatalog,status:'active'}));
fs.writeFileSync(path.join(state,'native-models.json'),JSON.stringify(native));
const prepared=path.join(path.dirname(state),'prepared'),plan=path.join(path.dirname(state),'plan');
prepareDirectory(prepared,{models:['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free']});prepareRouterPlan(plan,{prepared,routerState:state});
const overlay=api.overlay;let omitOnce=true;
api.overlay={...overlay,applyModelOverlayPublication:async options=>{
 const result=await overlay.applyModelOverlayPublication(options);
 if(omitOnce){omitOnce=false;fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify({models:[]}));}
 return result;
}};
await assert.rejects(registerRouter(plan,{api,restart:false}),/omitted/);
assert.equal(api.providers.readGenericProviders().length,0);assert.deepEqual(api.users.readUserModels(),[]);
fs.renameSync(plan,plan+'-failed-publication');prepareRouterPlan(plan,{prepared,routerState:state});
await registerRouter(plan,{api,restart:false});
const catalog=JSON.parse(fs.readFileSync(path.join(state,'merged-models.json')));
const slugs=catalog.models.map(x=>x.slug);assert.ok(slugs.includes('opencode-native-bridge/opencode/big-pickle'));assert.ok(slugs.includes('opencode-native-bridge/opencode/muse-spark-1.3-contributor-free'));assert.equal(JSON.parse(fs.readFileSync(originalCatalog)).models[0].slug,'gpt-native-sentinel');
await unregisterRouter(plan,{api,restart:false});
const after=JSON.parse(fs.readFileSync(path.join(state,'merged-models.json'))).models.map(x=>x.slug);assert.equal(JSON.parse(fs.readFileSync(originalCatalog)).models[0].slug,'gpt-native-sentinel');assert.ok(!after.includes('opencode-native-bridge/opencode/big-pickle'));
const receipt={passed:true,upstreamPinnedUnmodified:true,realCatalogPublication:true,missingModelRollback:true,nativeSourcePreserved:true,nativeSignedInPickerUntested:true,registrationRemoval:true,serviceRestartTested:false,desktopPickerTested:false};
fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/router-publication-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
