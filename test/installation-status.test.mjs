import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {installationStatus} from '../src/installation-status.mjs';
import {prepareDirectory} from '../src/setup.mjs';
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'install-status-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
test('Missing installation returns an actionable result without creating files',async t=>{
 const directory=fixture(t);const result=await installationStatus({directory});assert.equal(result.installed,false);assert.match(result.checks[0].next,/install/);assert.deepEqual(fs.readdirSync(directory),[]);
});
test('Status checks service and catalog without exposing tokens or claiming model access',async t=>{
 const directory=fixture(t),prepared=path.join(directory,'prepared'),plan=path.join(directory,'router-plan'),state=path.join(directory,'router');
 prepareDirectory(prepared,{models:['opencode/big-pickle']});fs.mkdirSync(plan);fs.mkdirSync(state);
 fs.writeFileSync(path.join(directory,'desktop-install.json'),JSON.stringify({kind:'bridge-desktop-install',status:'installed',prepared,plan}));
 fs.writeFileSync(path.join(plan,'router-plan.json'),JSON.stringify({routerState:state,models:[{slug:'model',displayName:'Big Pickle'}]}));
 fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify({models:[{slug:'model',visibility:'list'}]}));
 const token=fs.readFileSync(path.join(prepared,'state/local-token'),'utf8').trim();
 const opts={directory,inspectService:()=>({installed:true,loaded:true,running:true}),fetchImpl:async(url,options)=>{assert.equal(options.headers.authorization,'Bearer '+token);assert.match(url,/127\.0\.0\.1/);return {ok:true,json:async()=>({ok:true})};}};
 const good=await installationStatus(opts);assert.equal(good.configurationReady,true);assert.equal(good.modelAccessVerified,false);assert.ok(!JSON.stringify(good).includes(token));
 fs.writeFileSync(path.join(state,'merged-models.json'),JSON.stringify({models:[]}));
 const bad=await installationStatus(opts);assert.equal(bad.configurationReady,false);assert.equal(bad.checks.find(x=>x.id==='catalog').ok,false);
});
