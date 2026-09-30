import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {checkedPublication} from '../src/router-registration.mjs';
function fixture(t,models){const root=fs.mkdtempSync(path.join(os.tmpdir(),'publication-check-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'catalog.json');fs.writeFileSync(file,JSON.stringify({models}));return {paths:{MERGED_CATALOG_PATH:file},overlay:{applyModelOverlayPublication:async()=>({published:true})}};}
test('Missing or hidden requested models invalidate apparent publication success',async t=>{
 for(const models of [[],[{slug:'wanted',visibility:'hide'}]]){
  const api=fixture(t,models),publish=checkedPublication(api,{present:['wanted']});
  await assert.rejects(publish({}),/omitted/);
  // Rollback deliberately does not need the model whose install just failed.
  assert.deepEqual(await publish({}),{published:true});
 }
});
test('Registration requires visible models and removal requires actual absence',async t=>{
 const api=fixture(t,[{slug:'wanted',visibility:'list'}]);
 assert.deepEqual(await checkedPublication(api,{present:['wanted']})({}),{published:true});
 await assert.rejects(checkedPublication(api,{absent:['wanted']})({}),/remain/);
 fs.writeFileSync(api.paths.MERGED_CATALOG_PATH,JSON.stringify({models:[{slug:'unrelated',visibility:'list'}]}));
 assert.deepEqual(await checkedPublication(api,{absent:['wanted']})({}),{published:true});
});
