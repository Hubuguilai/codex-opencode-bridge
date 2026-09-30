import {test} from 'node:test';import assert from 'node:assert/strict';
import {doctor} from '../src/doctor.mjs';
test('Read-only doctor distinguishes prerequisites from actual access and installation',()=>{
 const calls=[];const result=doctor({platform:'darwin',node:'24.0.0',env:{},locate:()=>'/fake/opencode',run:(file,args)=>{calls.push([file,args]);return {status:0,stdout:file==='codex'?'codex-cli 0.157.1':'opencode v2.0.18'};}});
 assert.equal(result.prerequisitesReady,true);assert.equal(result.desktopInstalled,false);assert.equal(result.modelAccessVerified,false);assert.equal(result.readOnly,true);
 assert.equal(calls.length,2);assert.ok(calls.every(x=>x[1][0]==='--version'));
 assert.equal(result.models.find(x=>x.id.includes('muse')).images,true);
});
test('Doctor reports missing/incompatible dependencies without leaking stderr or credentials',()=>{
 const result=doctor({platform:'linux',node:'20.0.0',env:{SECRET:'secret'},locate:()=>{throw Error('SECRET');},run:()=>({status:1,stderr:'SECRET'})});
 assert.equal(result.prerequisitesReady,false);assert.ok(result.checks.every(x=>!x.ok));assert.ok(!JSON.stringify(result).includes('SECRET'));
 const wrong=doctor({platform:'darwin',node:'22.0.0',locate:()=>'/fake',run:()=>({status:0,stdout:'1.9.0'})});assert.equal(wrong.checks.find(x=>x.id==='opencode').ok,false);
});
