import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {prepareDirectory,removePreparedDirectory} from '../src/setup.mjs';
function workspace(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-setup-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('Preparation preserves existing catalog entries and removal restores the untouched source',t=>{
 const root=workspace(t),catalog=path.join(root,'original.json'),directory=path.join(root,'prepared');const bytes='{"models":[{"slug":"native-test","custom":{"keep":true}}]}\n';fs.writeFileSync(catalog,bytes);
 const result=prepareDirectory(directory,{catalog});assert.equal(result.catalogPreserved,true);
 const merged=JSON.parse(fs.readFileSync(path.join(directory,'models.json')));assert.deepEqual(merged.models[0],JSON.parse(bytes).models[0]);assert.equal(merged.models.length,2);
 assert.equal(fs.statSync(result.tokenPath).mode&0o777,0o600);assert.doesNotMatch(fs.readFileSync(path.join(directory,'codex.config.toml'),'utf8'),new RegExp(fs.readFileSync(result.tokenPath,'utf8')));
 removePreparedDirectory(directory);assert.equal(fs.existsSync(directory),false);assert.equal(fs.readFileSync(catalog,'utf8'),bytes);
});
test('Preparation refuses overwrite and uninstall refuses edited files or active runtime state',t=>{
 const root=workspace(t),directory=path.join(root,'prepared');prepareDirectory(directory);
 assert.throws(()=>prepareDirectory(directory),/already exists/);
 const file=path.join(directory,'models.json'),original=fs.readFileSync(file);fs.appendFileSync(file,' ');assert.throws(()=>removePreparedDirectory(directory),/modified/);fs.writeFileSync(file,original);
 fs.mkdirSync(path.join(directory,'state','work-running'));assert.throws(()=>removePreparedDirectory(directory),/stop the managed service/);
});


test('Multi-model preparation preserves native entries and keeps catalog, default and upstream allowlist aligned',t=>{
 const root=workspace(t),directory=path.join(root,'prepared'),catalog=path.join(root,'native.json');
 const original={models:[{slug:'gpt-example',display_name:'Unchanged native model'}]};fs.writeFileSync(catalog,JSON.stringify(original));
 const models=['opencode/mimo-v2.6-flash-free','opencode/nemotron-3-ultra-free','opencode/space-bunny-free'];
 const result=prepareDirectory(directory,{models,model:models[1],catalog});
 assert.deepEqual(result.models,models);assert.equal(result.model,models[1]);
 const merged=JSON.parse(fs.readFileSync(path.join(directory,'models.json')));
 assert.deepEqual(merged.models[0],original.models[0]);assert.deepEqual(merged.models.slice(1).map(x=>x.slug),models);
 const env=JSON.parse(fs.readFileSync(path.join(directory,'bridge-env.json')));
 assert.equal(env.BRIDGE_MODELS,models.join(','));assert.equal(env.BRIDGE_INTERNAL_TOOLS,'client-aliases');
 assert.match(fs.readFileSync(path.join(directory,'codex.config.toml'),'utf8'),/model = "opencode\/nemotron-3-ultra-free"/);
 removePreparedDirectory(directory);assert.deepEqual(JSON.parse(fs.readFileSync(catalog)),original);
});

test('Multi-model preparation rejects duplicates, unsupported IDs and defaults outside the catalog without writing',t=>{
 const root=workspace(t),directory=path.join(root,'prepared'),known='opencode/space-bunny-free';
 for(const options of [{models:[]},{models:[known,known]},{models:['opencode/untested']},{models:[known],model:'opencode/nemotron-3-ultra-free'}]){
  assert.throws(()=>prepareDirectory(directory,options));assert.equal(fs.existsSync(directory),false);
 }
});
