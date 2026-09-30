import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {installDesktop,uninstallDesktop} from '../src/desktop-install.mjs';
function fixture(t,{failHealth=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-flow-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const routerRoot=path.join(root,'router');fs.mkdirSync(path.join(routerRoot,'src'),{recursive:true});fs.writeFileSync(path.join(routerRoot,'src/model-overlay-publication.mjs'),'');
 const options={directory:path.join(root,'installation'),routerRoot,platform:'darwin'};const calls=[];let port=6000;
 const deps={loadRouter:async()=>({paths:{STATE_DIR:'isolated-state'}}),installRuntime:async()=>({binary:'/managed/opencode'}),freePort:async()=>port++,
 prepareDirectory:dir=>{calls.push('prepare');fs.mkdirSync(dir);},prepareRouterPlan:dir=>{calls.push('plan');fs.mkdirSync(dir);},
 installService:async()=>calls.push('service'),removeService:()=>calls.push('stop'),
 checkBridge:async()=>{calls.push('health');if(failHealth)throw Error('health failed');},
 registerRouter:async dir=>{calls.push('register');fs.writeFileSync(path.join(dir,'registration.json'),'{}');},
 unregisterRouter:async dir=>{calls.push('unregister');fs.unlinkSync(path.join(dir,'registration.json'));}};
 return {options,deps,calls};
}
test('Unified flow starts a healthy bridge before publishing and preserves dependency on uninstall',async t=>{
 const f=fixture(t);assert.equal((await installDesktop(f.options,f.deps)).installed,true);
 assert.deepEqual(f.calls,['prepare','plan','service','health','register']);
 assert.equal((await installDesktop(f.options,f.deps)).reused,true);
 assert.equal(f.calls.filter(x=>x==='prepare').length,1);
 const removed=await uninstallDesktop(f.options,f.deps);assert.equal(removed.routerPreserved,true);
 assert.deepEqual(f.calls.slice(-2),['unregister','stop']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.options.directory,'desktop-install.json'))).status,'uninstalled');
});
test('Health failure prevents model registration and retains recovery record',async t=>{
 const f=fixture(t,{failHealth:true});await assert.rejects(installDesktop(f.options,f.deps),/health failed/);
 assert.ok(!f.calls.includes('register'));assert.equal(f.calls.at(-1),'stop');
 const record=JSON.parse(fs.readFileSync(path.join(f.options.directory,'desktop-install.json')));
 assert.equal(record.status,'incomplete');assert.equal(record.failurePhase,'starting-service');
 assert.ok(!fs.existsSync(path.join(f.options.directory,'.installation-lock')));
 await assert.rejects(installDesktop(f.options,f.deps),/incomplete/);
});
test('Missing Router fails before changing installation state',async t=>{
 const f=fixture(t);fs.rmSync(f.options.routerRoot,{recursive:true});
 await assert.rejects(installDesktop(f.options,f.deps),/not installed/);
 assert.ok(!fs.existsSync(f.options.directory));assert.deepEqual(f.calls,[]);
});
