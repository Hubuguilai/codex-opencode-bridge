import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {prepareDirectory,preparedEnvironment} from '../src/setup.mjs';
import {planModelSelection,writeSelectionFiles} from '../src/model-selection.mjs';
import {stageRelease} from '../src/releases.mjs';
import {setDesktopModels,recoverDesktopModels} from '../src/desktop-models.mjs';
const both=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'];
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'model-selection-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const prepared=path.join(root,'prepared');prepareDirectory(prepared,{models:both});return {root,prepared};
}
test('Model selection changes image allowlist and catalog together while retaining token and ports',t=>{
 const f=fixture(t),before=preparedEnvironment(f.prepared,{}),token=fs.readFileSync(path.join(f.prepared,'state/local-token'));
 const selection=planModelSelection(f.prepared,[both[0]]);writeSelectionFiles(f.prepared,selection,'after');
 const after=preparedEnvironment(f.prepared,{});assert.equal(after.BRIDGE_MODELS,both[0]);assert.equal(after.BRIDGE_IMAGE_MODELS,'');assert.equal(after.BRIDGE_PORT,before.BRIDGE_PORT);
 assert.deepEqual(fs.readFileSync(path.join(f.prepared,'state/local-token')),token);
 writeSelectionFiles(f.prepared,selection,'before');assert.deepEqual(preparedEnvironment(f.prepared,{}),before);
});
test('Mixed files after interrupted update can be restored; unrelated user edits cannot',t=>{
 const f=fixture(t),selection=planModelSelection(f.prepared,[both[0]]);
 fs.writeFileSync(path.join(f.prepared,'models.json'),selection.after['models.json']);
 writeSelectionFiles(f.prepared,selection,'before');assert.equal(fs.readFileSync(path.join(f.prepared,'models.json'),'utf8'),selection.before['models.json']);
 fs.appendFileSync(path.join(f.prepared,'codex.config.toml'),'# user edit');
 assert.throws(()=>writeSelectionFiles(f.prepared,selection,'before'),/edited outside/);
 assert.ok(fs.readFileSync(path.join(f.prepared,'codex.config.toml'),'utf8').endsWith('# user edit'));
});
function desktop(t){
 const f=fixture(t),release=stageRelease(path.join(f.root,'releases')),plan=path.join(f.root,'router-plan');fs.mkdirSync(plan);
 for(const name of ['router-plan.json','registration.json','user-model-additions.json','menu-preview.json','REVIEW.md'])fs.writeFileSync(path.join(plan,name),name==='router-plan.json'?JSON.stringify({models:both.map(upstreamModel=>({upstreamModel}))}):'{}');
 const record={kind:'bridge-desktop-install',status:'installed',models:both,prepared:f.prepared,plan,release:release.directory,binary:process.execPath,routerRoot:path.join(f.root,'router')};
 const file=path.join(f.root,'desktop-install.json');fs.writeFileSync(file,JSON.stringify(record));const calls=[];
 const deps={loadRouter:async()=>({}),verifyRouterSelection:()=>{},serviceConfiguration:()=>({cli:release.cli,binary:process.execPath,node:process.execPath}),checkIdle:async()=>{},waitStopped:async()=>{},removeService:()=>calls.push('stop'),installService:async()=>calls.push('start'),checkBridge:async()=>calls.push('health'),updateRouterModels:async(dir,options)=>{calls.push('publish');fs.writeFileSync(path.join(dir,'router-plan.json'),options.restoreSelection?.['router-plan.json']??JSON.stringify({models:options.models.map(upstreamModel=>({upstreamModel}))}));}};
 return {...f,record,file,calls,deps};
}
test('Desktop model change orders healthy service before publication and supports repeated selection',async t=>{
 const f=desktop(t);assert.equal((await setDesktopModels({directory:f.root,models:[both[0]]},f.deps)).updated,true);
 assert.deepEqual(f.calls,['stop','start','health','publish']);assert.deepEqual(JSON.parse(fs.readFileSync(f.file)).models,[both[0]]);
 assert.equal((await setDesktopModels({directory:f.root,models:[both[0]]},f.deps)).alreadyCurrent,true);
});
test('Publication failure restores previous preparation and record',async t=>{
 const f=desktop(t);let fail=true;f.deps.updateRouterModels=async()=>{if(fail){fail=false;throw Error('publication failed');}};
 await assert.rejects(setDesktopModels({directory:f.root,models:[both[0]]},f.deps),/previous configuration/);
 assert.equal(preparedEnvironment(f.prepared,{}).BRIDGE_MODELS,both.join(','));assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.record);
});
test('Recovery failure leaves a journal and explicit recovery restores the old model set',async t=>{
 const f=desktop(t);f.deps.checkBridge=async()=>{throw Error('unavailable');};
 await assert.rejects(setDesktopModels({directory:f.root,models:[both[0]]},f.deps),/recover-models/);
 assert.ok(JSON.parse(fs.readFileSync(f.file)).modelChange);
 f.deps.checkBridge=async()=>{};assert.equal((await recoverDesktopModels({directory:f.root},f.deps)).restored,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.record);
});
