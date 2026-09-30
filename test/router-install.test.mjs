import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ensureRouter} from '../src/router-install.mjs';
const revision='b90aa60e257bbcc33855aad7d43954c1a09b1311';
function fixture(t,{failSetup=false,wrongRevision=false}={}){
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'router-bootstrap-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 const root=path.join(parent,'router'),calls=[];
 const run=async(cmd,args,{cwd})=>{
  calls.push([cmd,...args]);
  if(args[0]==='checkout'){
   fs.writeFileSync(path.join(cwd,'package.json'),JSON.stringify({name:'codex-model-router'}));
   fs.mkdirSync(path.join(cwd,'src'));fs.writeFileSync(path.join(cwd,'src/model-overlay-publication.mjs'),'');
  }
  if(args[0]==='rev-parse')return {status:0,stdout:wrongRevision?'wrong':revision};
  if(args[0]==='src/setup.mjs'&&failSetup)return {status:1,stderr:'secret diagnostic'};
  return {status:0,stdout:''};
 };
 return {parent,root,calls,opts:{platform:'darwin',run,compatibility:()=>({id:'tested-separately'})}};
}
test('First-time Router uses pinned source and upstream idle setup, repeat does not overwrite',async t=>{
 const f=fixture(t);assert.equal((await ensureRouter(f.root,f.opts)).reused,false);
 assert.ok(f.calls.some(x=>x[0]==='git'&&x.includes(revision)));
 const setup=f.calls.find(x=>x[1]==='src/setup.mjs');assert.ok(setup.includes('--no-provider'));assert.ok(!setup.includes('--no-discovery'));assert.ok(setup.includes('--adopt-native-catalog'));
 const count=f.calls.length;assert.equal((await ensureRouter(f.root,f.opts)).reused,true);assert.equal(f.calls.length,count);
});
test('Pinned revision mismatch does not publish a dependency directory',async t=>{
 const f=fixture(t,{wrongRevision:true});await assert.rejects(ensureRouter(f.root,f.opts),/revision/);
 assert.deepEqual(fs.readdirSync(f.parent),[]);
});
test('Failed setup retains phase evidence and refuses to blindly retry partial state',async t=>{
 const f=fixture(t,{failSetup:true});await assert.rejects(ensureRouter(f.root,f.opts),/step failed/);
 const record=JSON.parse(fs.readFileSync(path.join(f.root,'.bridge-router-install.json')));
 assert.equal(record.status,'incomplete');assert.equal(record.phase,'router-setup');
 await assert.rejects(ensureRouter(f.root,f.opts),/incomplete/);
});
