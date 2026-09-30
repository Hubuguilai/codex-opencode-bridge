import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {stageRelease,verifyRelease} from '../src/releases.mjs';
import {upgradeDesktop,recoverDesktopUpgrade} from '../src/desktop-upgrade.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-upgrade-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const first=stageRelease(path.join(root,'releases')),source=path.join(root,'candidate');fs.cpSync(first.directory,source,{recursive:true});fs.appendFileSync(path.join(source,'src/config.mjs'),'\n// candidate\n');
 const record={kind:'bridge-desktop-install',status:'installed',phase:'awaiting-client-verification',release:first.directory,binary:process.execPath,prepared:path.join(root,'prepared'),plan:path.join(root,'router-plan'),routerRoot:path.join(root,'router'),models:['opencode/big-pickle']};
 const file=path.join(root,'desktop-install.json');fs.writeFileSync(file,JSON.stringify(record));
 let service={cli:first.cli,binary:process.execPath,node:process.execPath};const calls=[];
 const deps={verifyRelease,stageRelease:base=>stageRelease(base,{source}),installRuntime:async()=>({binary:process.execPath}),serviceConfiguration:()=>({...service}),
 checkIdle:async()=>calls.push('idle'),waitStopped:async()=>calls.push('stopped'),
 removeService:()=>{calls.push('remove');service=null;},installService:async(dir,options)=>{calls.push('start');service={...options};},checkBridge:async()=>calls.push('health')};
 return {root,file,first,record,deps,calls,get service(){return service;}};
}
test('Upgrade and rollback preserve configuration while selecting exact independent versions',async t=>{
 const f=fixture(t),result=await upgradeDesktop({directory:f.root},f.deps);assert.equal(result.upgraded,true);
 const after=JSON.parse(fs.readFileSync(f.file));assert.equal(after.previousRelease,f.first.directory);assert.notEqual(after.release,f.first.directory);assert.deepEqual(after.models,f.record.models);assert.equal(after.plan,f.record.plan);
 assert.equal(f.service.cli,path.join(after.release,'bin/bridge.mjs'));assert.ok(!after.upgrade);
 assert.equal((await upgradeDesktop({directory:f.root},f.deps)).alreadyCurrent,true);
 assert.equal((await upgradeDesktop({directory:f.root,rollback:true},f.deps)).rolledBack,true);
 assert.equal(f.service.cli,f.first.cli);assert.equal(JSON.parse(fs.readFileSync(f.file)).release,f.first.directory);
});
test('Failed new service health restores exact prior record and checks old service',async t=>{
 const f=fixture(t);let count=0;f.deps.checkBridge=async()=>{if(++count===1)throw Error('injected');};
 await assert.rejects(upgradeDesktop({directory:f.root},f.deps),/previous version was restored/);
 assert.equal(count,2);assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.record);assert.equal(f.service.cli,f.first.cli);
 assert.ok(!fs.existsSync(path.join(f.root,'.installation-lock')));
});
test('Recovery failure retains a durable journal and a later recovery restores it',async t=>{
 const f=fixture(t);f.deps.checkBridge=async()=>{throw Error('service unavailable');};
 await assert.rejects(upgradeDesktop({directory:f.root},f.deps),/recover-upgrade/);
 const pending=JSON.parse(fs.readFileSync(f.file));assert.equal(pending.upgrade.kind,'bridge-code-upgrade');assert.deepEqual(pending.upgrade.original,f.record);
 await assert.rejects(upgradeDesktop({directory:f.root},f.deps),/interrupted upgrade/);
 f.deps.checkBridge=async()=>{};assert.equal((await recoverDesktopUpgrade({directory:f.root},f.deps)).restored,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.record);
});
test('An active task or a changed service fails before stopping anything',async t=>{
 const f=fixture(t);f.deps.checkIdle=async()=>{throw Error('active requests');};
 await assert.rejects(upgradeDesktop({directory:f.root},f.deps),/active requests/);assert.ok(!f.calls.includes('remove'));
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.record);
 f.deps.serviceConfiguration=()=>({cli:'/changed/cli',binary:process.execPath});
 await assert.rejects(upgradeDesktop({directory:f.root},f.deps),/Service paths differ/);assert.ok(!f.calls.includes('remove'));
});
test('An edited old release prevents upgrade and unsafe recovery paths are rejected',async t=>{
 const f=fixture(t);fs.appendFileSync(path.join(f.first.directory,'src/config.mjs'),'edited');
 await assert.rejects(upgradeDesktop({directory:f.root},f.deps),/release changed/);assert.ok(!f.calls.includes('remove'));
 fs.writeFileSync(f.file,JSON.stringify({...f.record,upgrade:{kind:'bridge-code-upgrade',original:{...f.record,prepared:'/unrelated'}}}));
 await assert.rejects(recoverDesktopUpgrade({directory:f.root},f.deps),/Invalid managed/);assert.ok(!f.calls.includes('remove'));
});

test('A process killed after stopping leaves a recoverable durable upgrade journal',async t=>{
 const f=fixture(t);
 const program=`import fs from 'node:fs';import path from 'node:path';
 import {upgradeDesktop} from ${JSON.stringify(new URL('../src/desktop-upgrade.mjs',import.meta.url).href)};
 import {stageRelease} from ${JSON.stringify(new URL('../src/releases.mjs',import.meta.url).href)};
 const root=process.env.UPGRADE_TEST_ROOT,record=JSON.parse(fs.readFileSync(path.join(root,'desktop-install.json')));
 await upgradeDesktop({directory:root},{stageRelease:base=>stageRelease(base,{source:path.join(root,'candidate')}),installRuntime:async()=>({binary:process.execPath}),serviceConfiguration:()=>({cli:path.join(record.release,'bin/bridge.mjs'),binary:record.binary,node:process.execPath}),checkIdle:async()=>{},removeService:()=>process.kill(process.pid,'SIGKILL')});`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',program],{env:{...process.env,UPGRADE_TEST_ROOT:f.root},timeout:10000,encoding:'utf8'});
 assert.equal(child.signal,'SIGKILL',child.stderr);assert.ok(JSON.parse(fs.readFileSync(f.file)).upgrade);
 assert.equal((await recoverDesktopUpgrade({directory:f.root},f.deps)).restored,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),f.record);
});
