import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {prepareDirectory} from '../src/setup.mjs';import {planModelSelection,writeSelectionFiles} from '../src/model-selection.mjs';import {prepareRouterPlan} from '../src/router-plan.mjs';
const big='opencode/big-pickle',muse='opencode/muse-spark-1.3-contributor-free',override={contextWindow:1048576,autoCompact:891289};
test('Explicit context preferences survive selection changes and Router plan publication',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'context-preserve-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const prepared=path.join(root,'prepared');
 prepareDirectory(prepared,{models:[big,muse],modelOverrides:{[big]:override}});
 const catalog=()=>JSON.parse(fs.readFileSync(path.join(prepared,'models.json'))).models;
 assert.equal(catalog()[0].context_window,1048576);assert.ok(catalog()[0].description.includes('not certified'));assert.deepEqual(catalog()[0].input_modalities,['text']);
 writeSelectionFiles(prepared,planModelSelection(prepared,[muse]),'after');writeSelectionFiles(prepared,planModelSelection(prepared,[big,muse]),'after');assert.equal(catalog()[0].auto_compact_token_limit,891289);
 const state=path.join(root,'router');fs.mkdirSync(state);for(const [name,doc]of Object.entries({'generic-providers.json':{providers:[]},'user-models.json':{models:[]},'merged-models.json':{models:[]}}))fs.writeFileSync(path.join(state,name),JSON.stringify(doc));
 const plan=path.join(root,'plan');prepareRouterPlan(plan,{prepared,routerState:state});const actual=JSON.parse(fs.readFileSync(path.join(plan,'router-plan.json')));
 assert.deepEqual(actual.modelOverrides,{[big]:override});assert.equal(actual.models[0].contextWindow,1048576);assert.equal(actual.models[0].autoCompact,891289);
});
test('Malformed context overrides cannot create preparation files or alter capabilities',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'context-invalid-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const dir=path.join(root,'prepared');
 for(const value of [{contextWindow:100,autoCompact:100},{contextWindow:100.5,autoCompact:50},{...override,images:true},{contextWindow:-1,autoCompact:1}]){
  assert.throws(()=>prepareDirectory(dir,{models:[big],modelOverrides:{[big]:value}}),/override/i);assert.equal(fs.existsSync(dir),false);
 }
});
