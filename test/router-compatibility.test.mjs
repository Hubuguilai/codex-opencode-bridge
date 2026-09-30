import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {ensureRouterCompatibility,inspectRouterCompatibility} from '../src/router-compatibility.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'router-compat-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'src'));
 const files=['router','api-forwarder'].map(name=>{const before=`export const ${name.replace('-','_')} = 1;\n`,after=before.replace('= 1','= 2'),file=`src/${name}.mjs`;fs.writeFileSync(path.join(root,file),before,{mode:0o644});return {path:file,beforeSha256:hash(before),afterSha256:hash(after),edits:[{before,after}]};});
 const spec={version:1,id:'test-only',files},folder=path.join(root,'.bridge-router-compatibility');
 return {root,spec,folder,read:name=>fs.readFileSync(path.join(root,'src',name+'.mjs'),'utf8')};
}
test('Version-bound compatibility is backed up, idempotent and preserves source permissions',t=>{
 const f=fixture(t);assert.equal(ensureRouterCompatibility(f.root,{spec:f.spec}).reused,false);
 for(const item of f.spec.files){assert.equal(hash(fs.readFileSync(path.join(f.root,item.path))),item.afterSha256);assert.equal(hash(fs.readFileSync(path.join(f.folder,path.basename(item.path)+'.original'))),item.beforeSha256);assert.equal(fs.statSync(path.join(f.root,item.path)).mode&0o777,0o644);}
 assert.equal(ensureRouterCompatibility(f.root,{spec:f.spec}).reused,true);
 assert.equal(inspectRouterCompatibility(f.root,{spec:f.spec}).verified,true);
 assert.equal(fs.existsSync(path.join(f.folder,'.installation-lock')),false);
});
test('Preflight protects every source when a later file has user changes',t=>{
 const f=fixture(t),first=f.read('router');fs.appendFileSync(path.join(f.root,'src/api-forwarder.mjs'),'// user change');
 assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/source differs/);assert.equal(f.read('router'),first);assert.ok(f.read('api-forwarder').includes('user change'));
});
test('A partial application resumes only from exact before/after files',t=>{
 const f=fixture(t);assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec,afterWrite:()=>{throw Error('simulated interruption');}}),/interruption/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.folder,'record.json'))).status,'applying');
 assert.throws(()=>inspectRouterCompatibility(f.root,{spec:f.spec}),/incomplete/);
 assert.equal(hash(f.read('router')),f.spec.files[0].afterSha256);assert.equal(hash(f.read('api-forwarder')),f.spec.files[1].beforeSha256);
 ensureRouterCompatibility(f.root,{spec:f.spec});assert.equal(hash(f.read('api-forwarder')),f.spec.files[1].afterSha256);
});
test('Interrupted backup preparation can resume without overwriting its original snapshot',t=>{
 const f=fixture(t);fs.mkdirSync(f.folder);const backup=path.join(f.folder,'router.mjs.original');fs.writeFileSync(backup,f.read('router'));
 ensureRouterCompatibility(f.root,{spec:f.spec});assert.equal(hash(fs.readFileSync(backup)),f.spec.files[0].beforeSha256);
});
test('User edits and corrupted backups stop subsequent compatibility work',t=>{
 const f=fixture(t);ensureRouterCompatibility(f.root,{spec:f.spec});
 fs.appendFileSync(path.join(f.root,'src/router.mjs'),'// edited');assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/source differs/);
 fs.writeFileSync(path.join(f.root,'src/router.mjs'),f.spec.files[0].edits[0].after);
 fs.appendFileSync(path.join(f.folder,'router.mjs.original'),'// edited');assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/backup changed/);
});
test('Unowned patched files and symbolic links are never adopted',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.root,'src/router.mjs'),f.spec.files[0].edits[0].after);
 assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/unowned/);
 fs.unlinkSync(path.join(f.root,'src/router.mjs'));fs.symlinkSync('api-forwarder.mjs',path.join(f.root,'src/router.mjs'));
 assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/regular/);
});
