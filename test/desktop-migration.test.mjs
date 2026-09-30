import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {migrateDesktop,recoverDesktopMigration} from '../src/desktop-migration.mjs';import {prepareDirectory,preparedEnvironment} from '../src/setup.mjs';
function fixture(t){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-migration-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));const root=path.join(temp,'installation'),routerRoot=path.join(temp,'router'),plist=path.join(temp,'legacy.plist'),tokenPath=path.join(temp,'local-token');fs.mkdirSync(routerRoot);fs.writeFileSync(plist,'legacy-plist');fs.writeFileSync(tokenPath,'synthetic-private-local-token-for-migration');
 const models=['opencode/big-pickle','opencode/muse-spark-1.3-contributor-free'],route={baseUrl:'http://127.0.0.1:4396/v1',modelOverrides:Object.fromEntries(models.map(id=>[id,{contextWindow:1048576,autoCompact:891289}]))};
 const legacy={kind:'bridge-legacy-service',plist,label:'test.legacy',port:4396,upstreamPort:4397,models,tokenPath,contents:Buffer.from('legacy-plist').toString('base64')};
 const state={old:true,candidate:false,route:'old',calls:[],fail:undefined},call=x=>{state.calls.push(x);if(state.fail===x){state.fail=undefined;throw Error('Injected '+x);}};let port=4400;
 const deps={inspectLegacyService:()=>{call('inspect');return legacy;},checkLegacyService:async()=>{call('old-health');assert.ok(state.old);},retireLegacyService:async()=>{call('retire');state.old=false;fs.unlinkSync(plist);},restoreLegacyService:async()=>{call('restore-old');state.old=true;if(!fs.existsSync(plist))fs.writeFileSync(plist,'legacy-plist');},
 inspectLegacyRouterRoute:()=>route,loadRouter:async()=>({paths:{STATE_DIR:routerRoot}}),inspectRouterCompatibility:()=>{call('source');return {verified:true};},
 installRuntime:async()=>{call('runtime');return {binary:'/fixture/opencode'};},stageRelease:base=>{const directory=path.join(base,'a'.repeat(64));fs.mkdirSync(directory,{recursive:true});return {directory,cli:path.join(directory,'bridge.mjs')};},verifyRelease:directory=>({directory,cli:path.join(directory,'bridge.mjs')}),freePort:async()=>++port,prepareDirectory,preparedEnvironment,
 installService:async()=>{call('start-new');state.candidate=true;},checkBridge:async()=>{call('new-health');assert.ok(state.candidate);},removeService:async()=>{call('remove-new');state.candidate=false;},waitStopped:async()=>{call('wait-stopped');},
 prepareRouterPlan:dir=>{call('plan');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'router-plan.json'),'{}');},captureLegacyRouteRecovery:()=>({kind:'test-recovery'}),adoptLegacyRouterRoute:async()=>{state.route='new';call('publish');},verifyRouterSelection:()=>{call('verify-route');assert.equal(state.route,'new');},restoreLegacyRouterRoute:async()=>{call('restore-route');assert.ok(state.old);state.route='old';}};
 return {root,routerRoot,plist,tokenPath,state,deps,options:{directory:root,routerRoot,legacyPlist:plist,platform:'darwin'}};
}
test('Migration starts a healthy candidate before publishing and retires old service last',async t=>{
 const f=fixture(t),r=await migrateDesktop(f.options,f.deps);assert.equal(r.migrated,true);assert.equal(f.state.old,false);assert.equal(f.state.candidate,true);
 const calls=f.state.calls;assert.ok(calls.indexOf('new-health')<calls.indexOf('publish'));assert.ok(calls.indexOf('publish')<calls.indexOf('retire'));
 const record=JSON.parse(fs.readFileSync(path.join(f.root,'desktop-install.json')));assert.equal(record.status,'installed');assert.equal(record.migratedLegacyService,true);
 assert.deepEqual(fs.readFileSync(path.join(f.root,'prepared/state/local-token')),fs.readFileSync(f.tokenPath));
 const prepared=JSON.parse(fs.readFileSync(path.join(f.root,'prepared/models.json')));assert.ok(prepared.models.every(x=>x.context_window===1048576&&x.auto_compact_token_limit===891289));
 assert.equal((await migrateDesktop(f.options,f.deps)).reused,true);
});
test('Failure after route mutation restores old route before removing the candidate and retry succeeds',async t=>{
 const f=fixture(t);f.state.fail='publish';await assert.rejects(migrateDesktop(f.options,f.deps),/legacy route and healthy service were restored/);
 assert.equal(f.state.route,'old');assert.equal(f.state.old,true);assert.equal(f.state.candidate,false);assert.ok(f.state.calls.indexOf('restore-route')<f.state.calls.indexOf('remove-new'));
 assert.equal(fs.existsSync(path.join(f.root,'desktop-install.json')),false);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'desktop-migration.json'))).status,'restored');
 assert.equal((await migrateDesktop(f.options,f.deps)).migrated,true);
});
test('Failed legacy retirement restores the route while preserving the original plist backup',async t=>{
 const f=fixture(t);f.state.fail='retire';await assert.rejects(migrateDesktop(f.options,f.deps),/were restored/);assert.equal(f.state.route,'old');assert.deepEqual(fs.readFileSync(path.join(f.root,'legacy/original.plist')),fs.readFileSync(f.plist));
});
test('Explicit recovery of interrupted retirement restores a running old service and withdraws the candidate',async t=>{
 const f=fixture(t);await migrateDesktop(f.options,f.deps);fs.unlinkSync(path.join(f.root,'desktop-install.json'));const file=path.join(f.root,'desktop-migration.json'),tx=JSON.parse(fs.readFileSync(file));tx.status='migrating';tx.phase='retiring-legacy';fs.writeFileSync(file,JSON.stringify(tx));
 assert.equal((await recoverDesktopMigration({directory:f.root},f.deps)).restored,true);assert.equal(f.state.old,true);assert.equal(f.state.route,'old');assert.equal(f.state.candidate,false);
});
test('Retry refuses an edited candidate credential instead of silently overwriting it',async t=>{
 const f=fixture(t);f.state.fail='publish';await assert.rejects(migrateDesktop(f.options,f.deps),/were restored/);
 const token=path.join(f.root,'prepared/state/local-token'),changed='user-edited-local-credential-preserve-me';fs.writeFileSync(token,changed);
 await assert.rejects(migrateDesktop(f.options,f.deps),/were restored/);assert.equal(fs.readFileSync(token,'utf8'),changed);assert.equal(f.state.route,'old');assert.equal(f.state.old,true);
});
