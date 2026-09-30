import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {prepareDirectory} from '../src/setup.mjs';import {prepareRouterPlan} from '../src/router-plan.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-router-plan-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const prepared=path.join(root,'prepared'),routerState=path.join(root,'router');fs.mkdirSync(routerState);
 prepareDirectory(prepared,{models:['opencode/space-bunny-free','opencode/nemotron-3-ultra-free']});
 const catalog={models:[{slug:'gpt-existing',custom:{keep:true}},{slug:'old-bridge/model',display_name:'Existing route'}]};
 for(const [file,value]of Object.entries({'generic-providers.json':{version:1,providers:[{id:'old-bridge'}]},'user-models.json':{version:1,models:[{slug:'old-bridge/model'}]},'merged-models.json':catalog}))fs.writeFileSync(path.join(routerState,file),JSON.stringify(value));
 return {root,prepared,routerState,catalog};
}
test('Router plan preserves every existing catalog entry, exports exact routes, and copies no token or live state',t=>{
 const {root,prepared,routerState,catalog}=fixture(t),out=path.join(root,'plan');
 const before=Object.fromEntries(fs.readdirSync(routerState).map(name=>[name,fs.readFileSync(path.join(routerState,name),'utf8')]));
 const result=prepareRouterPlan(out,{prepared,routerState});assert.equal(result.applied,false);assert.equal(result.addedModels,2);
 const plan=JSON.parse(fs.readFileSync(path.join(out,'router-plan.json'))),menu=JSON.parse(fs.readFileSync(path.join(out,'menu-preview.json')));
 assert.deepEqual(menu.models.slice(0,2),catalog.models);assert.equal(menu.models.length,4);
 assert.equal(plan.provider.adapter,'openai-responses');assert.equal(plan.provider.baseUrl,'http://127.0.0.1:4396/v1');
 assert.deepEqual(plan.models.map(x=>x.upstreamModel),['opencode/space-bunny-free','opencode/nemotron-3-ultra-free']);
 assert.equal(plan.models[0].slug,'opencode-native-bridge/opencode/space-bunny-free');assert.equal(plan.models[0].defaultEffort,'default');
 assert.ok(plan.models.every(model=>model.visionBridge===false));
 const token=fs.readFileSync(path.join(prepared,'state/local-token'),'utf8');
 for(const name of fs.readdirSync(out)){assert.equal(fs.readFileSync(path.join(out,name),'utf8').includes(token),false);assert.equal(fs.statSync(path.join(out,name)).mode&0o777,0o600);}
 for(const [name,bytes]of Object.entries(before))assert.equal(fs.readFileSync(path.join(routerState,name),'utf8'),bytes);
});
test('Router plan refuses provider/model conflicts and invalid sources without leaving partial output',t=>{
 const {root,prepared,routerState}=fixture(t),out=path.join(root,'plan');
 const providerFile=path.join(routerState,'generic-providers.json'),before=fs.readFileSync(providerFile);
 fs.writeFileSync(providerFile,JSON.stringify({providers:[{id:'opencode-native-bridge'}]}));assert.throws(()=>prepareRouterPlan(out,{prepared,routerState}),/already exists/);assert.equal(fs.existsSync(out),false);
 fs.writeFileSync(providerFile,before);fs.writeFileSync(path.join(routerState,'user-models.json'),JSON.stringify({models:[{slug:'opencode-native-bridge/opencode/space-bunny-free'}]}));assert.throws(()=>prepareRouterPlan(out,{prepared,routerState}),/already exists/);assert.equal(fs.existsSync(out),false);
 fs.writeFileSync(path.join(routerState,'user-models.json'),'{}');assert.throws(()=>prepareRouterPlan(out,{prepared,routerState}),/Invalid router/);assert.equal(fs.existsSync(out),false);
});
