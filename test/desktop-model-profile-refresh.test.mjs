import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {setDesktopModels} from '../src/desktop-models.mjs';import {prepareDirectory} from '../src/setup.mjs';import {stageRelease} from '../src/releases.mjs';
function fixture(t,current){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'profile-refresh-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const prepared=path.join(directory,'prepared'),plan=path.join(directory,'router-plan'),models=['opencode/big-pickle'];prepareDirectory(prepared,{models});fs.mkdirSync(plan);
 const release=stageRelease(path.join(directory,'releases'));
 const record={kind:'bridge-desktop-install',status:'installed',prepared,plan,routerRoot:path.join(directory,'router'),models,release:release.directory,binary:'/test/runtime'};
 fs.writeFileSync(path.join(directory,'desktop-install.json'),JSON.stringify(record));
 fs.writeFileSync(path.join(plan,'router-plan.json'),JSON.stringify({models:[{upstreamModel:models[0],...(current?{visionBridge:false,bridgeStrictImages:true}:{})}]}));
 for(const name of ['registration.json','user-model-additions.json','menu-preview.json','REVIEW.md'])fs.writeFileSync(path.join(plan,name),'{}');
 const operations=[];
 const deps={serviceConfiguration:()=>({cli:release.cli,binary:record.binary}),loadRouter:async()=>({}),verifyRouterSelection:()=>{},checkIdle:async()=>{},ensureRouterCompatibility:()=>operations.push('compatibility'),removeService:()=>operations.push('stop'),waitStopped:async()=>{},installService:async()=>operations.push('start'),checkBridge:async()=>{},updateRouterModels:async(_,options)=>{operations.push('publish');assert.deepEqual(options.models,models);}};
 return {directory,models,deps,operations};
}
test('Same model selection refreshes older capability profiles transactionally',async t=>{
 const f=fixture(t,false),result=await setDesktopModels(f,f.deps);assert.equal(result.updated,true);assert.deepEqual(f.operations,['compatibility','stop','start','publish']);
 const record=JSON.parse(fs.readFileSync(path.join(f.directory,'desktop-install.json')));assert.equal(record.status,'installed');assert.equal(record.modelChange,undefined);
});
test('Already-current profiles keep repeat selection free of mutation',async t=>{
 const f=fixture(t,true),result=await setDesktopModels(f,f.deps);assert.equal(result.alreadyCurrent,true);assert.deepEqual(f.operations,[]);
});
