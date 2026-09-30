// Rehearse exact current customization on a disposable checkout, never the source.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {routerMigrationPreflight} from '../src/router-migration-preflight.mjs';
import {reconcileRouterSource} from '../src/router-source-reconciliation.mjs';
import {ensureRouterCompatibility,inspectRouterCompatibility} from '../src/router-compatibility.mjs';
const source=path.resolve(process.argv[2]??'');if(!process.argv[2])throw Error('Usage: node scripts/source-reconciliation-rehearsal.mjs ROUTER_DIRECTORY');
const spec=JSON.parse(fs.readFileSync(new URL('../runtime/router-compatibility.json',import.meta.url))),hash=x=>createHash('sha256').update(x).digest('hex');
const before=Object.fromEntries(spec.files.map(x=>[x.path,fs.readFileSync(path.join(source,x.path))]));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-source-rehearsal-')),root=path.join(temp,'router');
const run=(command,args)=>{const result=spawnSync(command,args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});if(result.status!==0)throw Error('Source rehearsal command failed; local test state retained.');return result.stdout;};
let passed=false;
try{
 run('git',['clone','--quiet','--shared','--no-checkout',source,root]);run('git',['-C',root,'checkout','--quiet','--detach',spec.upstreamRevision]);
 for(const [name,bytes]of Object.entries(before))fs.writeFileSync(path.join(root,name),bytes);
 const expected=routerMigrationPreflight({routerRoot:root});assert.equal(expected.sourceMergeable,true);
 let interrupted=false;assert.throws(()=>reconcileRouterSource(root,{expected,afterWrite:()=>{interrupted=true;throw Error('Simulated interruption');}}),/Simulated interruption/);assert.ok(interrupted);
 assert.equal(ensureRouterCompatibility(root).reused,false);assert.equal(inspectRouterCompatibility(root).verified,true);assert.equal(ensureRouterCompatibility(root).reused,true);
 for(const item of spec.files){run(process.execPath,['--check',path.join(root,item.path)]);assert.equal(hash(fs.readFileSync(path.join(root,item.path))),expected.checks.find(x=>x.file===item.path).proposedSha256);assert.deepEqual(fs.readFileSync(path.join(root,'.bridge-router-compatibility',path.basename(item.path)+'.original')),before[item.path]);assert.deepEqual(fs.readFileSync(path.join(source,item.path)),before[item.path]);}
 const receipt={date:new Date().toISOString(),baseRevision:spec.upstreamRevision,sourceIsolated:true,activeSourceUnchanged:true,servicesRestarted:false,modelRequests:0,checks:{reconciliationApplied:true,originalCustomizationBackedUp:true,interruptedWriteResumed:true,ordinaryCompatibilityRepeat:true,patchedSyntaxValid:true},files:expected.checks,scope:'Disposable copy of the current two compatibility source files. No service cutover, actual client or behavioral certification of all customizations.'};
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/source-reconciliation-rehearsal.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));passed=true;
}finally{if(passed)fs.rmSync(temp,{recursive:true,force:true});}
