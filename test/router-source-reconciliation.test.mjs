import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {routerMigrationPreflight} from '../src/router-migration-preflight.mjs';
import {reconcileRouterSource} from '../src/router-source-reconciliation.mjs';
import {ensureRouterCompatibility,inspectRouterCompatibility} from '../src/router-compatibility.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-reconciliation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'src'));
 const run=args=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};run(['init','-q']);
 const base='export const guarded = 1;\n'+Array.from({length:25},(_,i)=>'// spacer '+i).join('\n')+'\nexport const custom = 1;\n';
 const files=['router','api-forwarder'].map(name=>{const file='src/'+name+'.mjs';fs.writeFileSync(path.join(root,file),base);return {path:file,beforeSha256:hash(base),afterSha256:hash(base.replace('guarded = 1','guarded = 2')),edits:[{before:'guarded = 1',after:'guarded = 2'}]};});
 run(['add','.']);run(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-qm','fixture']);
 const spec={id:'test',upstreamRevision:run(['rev-parse','HEAD']),files};for(const item of files)fs.writeFileSync(path.join(root,item.path),base.replace('custom = 1','custom = 9'));
 const read=file=>fs.readFileSync(path.join(root,file),'utf8');return {root,spec,read,run,base,preflight:()=>routerMigrationPreflight({routerRoot:root},{spec})};
}
test('Explicit source reconciliation retains local edits and is recognized by ordinary compatibility operations',t=>{
 const f=fixture(t),expected=f.preflight(),head=f.run(['rev-parse','HEAD']);
 assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/source differs/);
 assert.equal(reconcileRouterSource(f.root,{spec:f.spec,expected}).reconciled,true);
 for(const item of f.spec.files){assert.equal(f.read(item.path),f.base.replace('guarded = 1','guarded = 2').replace('custom = 1','custom = 9'));assert.equal(f.read('.bridge-router-compatibility/'+path.basename(item.path)+'.original'),f.base.replace('custom = 1','custom = 9'));}
 assert.equal(ensureRouterCompatibility(f.root,{spec:f.spec}).reused,true);assert.equal(inspectRouterCompatibility(f.root,{spec:f.spec}).verified,true);
 assert.equal(reconcileRouterSource(f.root,{spec:f.spec}).reused,true);assert.equal(f.run(['rev-parse','HEAD']),head);assert.equal(f.run(['diff','--cached','--name-only']),'');
});
test('Reconciliation resumes partial writes through the ordinary compatibility entrypoint',t=>{
 const f=fixture(t);assert.throws(()=>reconcileRouterSource(f.root,{spec:f.spec,expected:f.preflight(),afterWrite:()=>{throw Error('Interrupted');}}),/Interrupted/);
 assert.throws(()=>inspectRouterCompatibility(f.root,{spec:f.spec}),/incomplete/);
 assert.equal(ensureRouterCompatibility(f.root,{spec:f.spec}).reused,false);assert.equal(inspectRouterCompatibility(f.root,{spec:f.spec}).verified,true);
});
test('Conflicts and stale preflight leave current source untouched',t=>{
 const f=fixture(t),expected=f.preflight();fs.appendFileSync(path.join(f.root,'src/router.mjs'),'// later edit\n');const current=f.read('src/router.mjs');
 assert.throws(()=>reconcileRouterSource(f.root,{spec:f.spec,expected}),/preflight/);assert.equal(f.read('src/router.mjs'),current);
 fs.writeFileSync(path.join(f.root,'src/router.mjs'),f.base.replace('guarded = 1','guarded = 9'));
 assert.throws(()=>reconcileRouterSource(f.root,{spec:f.spec,expected:f.preflight()}),/conflicted/);assert.ok(f.read('src/router.mjs').includes('guarded = 9'));
});
test('Altered evidence, user edits and unknown future compatibility cannot be silently accepted',t=>{
 const f=fixture(t);reconcileRouterSource(f.root,{spec:f.spec,expected:f.preflight()});
 assert.throws(()=>ensureRouterCompatibility(f.root,{spec:{...f.spec,id:'future'}}),/matching compatibility/);
 fs.appendFileSync(path.join(f.root,'src/router.mjs'),'// new user edit');assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/source differs/);
 const backup=path.join(f.root,'.bridge-router-compatibility/router.mjs.reconciliation-original');fs.appendFileSync(backup,'// changed evidence');assert.throws(()=>inspectRouterCompatibility(f.root,{spec:f.spec}),/original changed/);
});
test('A forged merged hash or symbolic evidence file cannot bypass recomputation',t=>{
 const f=fixture(t);reconcileRouterSource(f.root,{spec:f.spec,expected:f.preflight()});const file=path.join(f.root,'.bridge-router-compatibility/reconciliation.json'),record=JSON.parse(fs.readFileSync(file));record.files[0].afterSha256='0'.repeat(64);fs.writeFileSync(file,JSON.stringify(record));
 assert.throws(()=>inspectRouterCompatibility(f.root,{spec:f.spec}),/reproduce/);
 fs.renameSync(file,file+'.saved');fs.symlinkSync(file+'.saved',file);assert.throws(()=>ensureRouterCompatibility(f.root,{spec:f.spec}),/regular file/);
});
test('A killed reconciliation process is recovered from durable originals and stale locks',t=>{
 const f=fixture(t),input=path.join(f.root,'rehearsal-input.json');fs.writeFileSync(input,JSON.stringify({root:f.root,spec:f.spec,expected:f.preflight()}));
 const child=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';import {reconcileRouterSource} from ${JSON.stringify(new URL('../src/router-source-reconciliation.mjs',import.meta.url).href)};const x=JSON.parse(fs.readFileSync(process.argv[1]));reconcileRouterSource(x.root,{spec:x.spec,expected:x.expected,afterWrite:()=>process.kill(process.pid,'SIGKILL')});`,input],{encoding:'utf8',timeout:10000});
 assert.equal(child.signal,'SIGKILL');assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'.bridge-router-compatibility/record.json'))).status,'applying');
 assert.equal(reconcileRouterSource(f.root,{spec:f.spec}).reconciled,true);assert.equal(inspectRouterCompatibility(f.root,{spec:f.spec}).verified,true);
 assert.equal(fs.existsSync(path.join(f.root,'.bridge-source-reconciliation-lock')),false);assert.equal(fs.existsSync(path.join(f.root,'.bridge-router-compatibility/.installation-lock')),false);
});
