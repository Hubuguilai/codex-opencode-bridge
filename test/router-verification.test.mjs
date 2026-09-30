import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {routerVerificationRoute} from '../src/router-verification.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'router-verify-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const plan=path.join(root,'plan');fs.mkdirSync(plan);const model='opencode/big-pickle',slug='opencode-native-bridge/'+model;
 fs.writeFileSync(path.join(plan,'router-plan.json'),JSON.stringify({models:[{upstreamModel:model,slug,bridgeStrictImages:true,visionBridge:false}]}));
 const secret=path.join(root,'caller-secret');fs.writeFileSync(secret,'test-private-caller-key-with-length',{mode:0o600});
 const catalog=path.join(root,'catalog.json');fs.writeFileSync(catalog,JSON.stringify({models:[{slug,visibility:'list',input_modalities:['text']}]}));
 const paths={CALLER_SECRET_PATH:secret,MERGED_CATALOG_PATH:catalog,PORTS:{router:49123}};
 let verified=false;const deps={load:async()=>({paths}),verify:()=>{verified=true;},compatibility:()=>({id:'test-compatible'})};
 return {root,secret,catalog,paths,deps,record:{plan,routerRoot:root,models:[model]},slug,get verified(){return verified;}};
}
test('Router verification uses the protected caller credential and actual published slug',async t=>{
 const f=fixture(t),route=await routerVerificationRoute(f.record,f.deps);
 assert.equal(f.verified,true);assert.equal(route.baseUrl,'http://127.0.0.1:49123/v1');assert.equal(route.models[0].model,f.slug);assert.equal(route.models[0].id,f.record.models[0]);assert.equal(route.token,fs.readFileSync(f.secret,'utf8'));
});
test('Published virtual vision is not counted as native image support',async t=>{
 const f=fixture(t);
 fs.writeFileSync(f.catalog,JSON.stringify({models:[{slug:f.slug,visibility:'list',input_modalities:['text','image']}]}));
 const route=await routerVerificationRoute(f.record,f.deps);
 assert.equal(route.models[0].images,false);assert.equal(route.models[0].routerAdvertisesImages,true);
});
test('Unsafe credentials, missing menu entries and mismatched selections stop before model calls',async t=>{
 const f=fixture(t);fs.chmodSync(f.secret,0o644);await assert.rejects(routerVerificationRoute(f.record,f.deps),/protected/);fs.chmodSync(f.secret,0o600);
 fs.writeFileSync(f.catalog,JSON.stringify({models:[]}));await assert.rejects(routerVerificationRoute(f.record,f.deps),/published/);
 await assert.rejects(routerVerificationRoute({...f.record,models:['opencode/other']},f.deps),/selections differ/);
});
