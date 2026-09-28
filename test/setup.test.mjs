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
