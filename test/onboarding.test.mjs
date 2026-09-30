import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {setupForUser,onboardingNext} from '../src/onboarding.mjs';
import {loginProvider} from '../src/provider-login.mjs';
const run=()=>({status:0});
test('onboarding requires live consent and dependencies before installation',async()=>{
 let writes=0;const deps={run:()=>({status:1}),installDesktop:()=>writes++};
 await assert.rejects(setupForUser({},deps),/setup --live/);
 await assert.rejects(setupForUser({live:true},deps),/缺少 git/);assert.equal(writes,0);
});
test('fresh onboarding chooses Big Pickle and validates the installed Router route',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-onboard-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const calls=[];const result=await setupForUser({live:true,directory},{run,
 installDesktop:async args=>{calls.push(args);return {models:args.models};},
 verifyInstalled:async args=>{calls.push(args);return {passed:true,receipt:'receipt',models:[{passed:true}]};}});
 assert.deepEqual(calls[0].models,['opencode/big-pickle']);assert.equal(calls[1].route,'router');
 assert.equal(result.ready,true);assert.equal(result.desktopPickerVerified,false);
 fs.writeFileSync(path.join(directory,'desktop-install.json'),'{}');
 await setupForUser({live:true,directory},{run,installDesktop:async args=>{assert.equal(args.models,undefined);return {};},verifyInstalled:async()=>({passed:true})});
});
test('onboarding retains installed status and gives bounded action on denied model',async()=>{
 let verified=0;const result=await setupForUser({live:true},{run,installDesktop:async()=>({models:['x']}),verifyInstalled:async()=>{verified++;return {passed:false,stopReason:'model_access',models:[]};}});
 assert.equal(result.ready,false);assert.equal(result.installed,true);assert.equal(verified,1);assert.match(result.next,/地区/);
});
test('ownership conflict never starts verification or force recovery',async()=>{
 const result=await setupForUser({live:true},{run,installDesktop:async()=>{throw Error('Existing incompatible Router');},verifyInstalled:()=>{throw Error('must not run');}});
 assert.equal(result.category,'legacy_configuration');assert.equal(result.installed,false);
 assert.match(onboardingNext('rate_limit'),/不要反复/);
});
test('login never prompts for secrets through a noninteractive agent process',()=>{
 assert.throws(()=>loginProvider({tty:false,install:()=>{throw Error('must not install');}}),/本地终端/);
 let args;const result=loginProvider({tty:true,install:()=>({binary:'/runtime/opencode'}),run:(_binary,a,options)=>{args=a;assert.equal(options.stdio,'inherit');return {status:0};}});
 assert.deepEqual(args,['auth','login','--provider','opencode']);assert.equal(result.modelAccessVerified,false);
});
