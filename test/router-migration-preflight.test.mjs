import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {routerMigrationPreflight} from '../src/router-migration-preflight.mjs';import {parseCommand} from '../src/cli.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'migration-preflight-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'src'));
 const run=args=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};run(['init','-q']);
 const base='export const guarded = 1;\n'+Array.from({length:25},(_,i)=>'// spacer '+i).join('\n')+'\nexport const custom = 1;\n';const after=base.replace('guarded = 1','guarded = 2'),file=path.join(root,'src/router.mjs');fs.writeFileSync(file,base);
 run(['add','.']);run(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-qm','fixture']);
 const spec={id:'test',upstreamRevision:run(['rev-parse','HEAD']),files:[{path:'src/router.mjs',beforeSha256:hash(base),afterSha256:hash(after),edits:[{before:'guarded = 1',after:'guarded = 2'}]}]};return {root,file,base,after,spec,run};
}
test('Read-only preflight merges disjoint customization and preserves files and Git state',t=>{
 const f=fixture(t),custom=f.base.replace('custom = 1','custom = 9');fs.writeFileSync(f.file,custom);const status=f.run(['status','--porcelain']);
 const result=routerMigrationPreflight({routerRoot:f.root},{spec:f.spec});assert.equal(result.sourceMergeable,true);assert.equal(result.migrationImplemented,false);
 assert.equal(result.checks[0].proposedSha256,hash(f.after.replace('custom = 1','custom = 9')));assert.equal(fs.readFileSync(f.file,'utf8'),custom);assert.equal(f.run(['status','--porcelain']),status);assert.ok(!JSON.stringify(result).includes(f.root));
});
test('Overlapping edits are reported without writing conflict markers into user source',t=>{
 const f=fixture(t),custom=f.base.replace('guarded = 1','guarded = 9');fs.writeFileSync(f.file,custom);
 const result=routerMigrationPreflight({routerRoot:f.root},{spec:f.spec});assert.equal(result.sourceMergeable,false);assert.equal(result.checks[0].reason,'overlapping_changes_or_merge_error');assert.equal(fs.readFileSync(f.file,'utf8'),custom);
});
test('Unexpected revisions, corrupt base hashes and symbolic links are not accepted',t=>{
 const f=fixture(t);assert.equal(routerMigrationPreflight({routerRoot:f.root},{spec:{...f.spec,upstreamRevision:'unknown'}}).reason,'unsupported_base_revision');
 const wrong=structuredClone(f.spec);wrong.files[0].beforeSha256='wrong';assert.throws(()=>routerMigrationPreflight({routerRoot:f.root},{spec:wrong}),/Pinned Git source/);
 fs.renameSync(f.file,f.file+'.saved');fs.symlinkSync('router.mjs.saved',f.file);assert.throws(()=>routerMigrationPreflight({routerRoot:f.root},{spec:f.spec}),/regular file/);
});
test('Migration preflight CLI accepts only read-only source selection',()=>{
 assert.equal(parseCommand(['migration-preflight']).command,'migration-preflight');assert.equal(parseCommand(['migration-preflight','--router-root','/tmp/router']).options['router-root'],'/tmp/router');
 assert.throws(()=>parseCommand(['migration-preflight','--apply']));assert.throws(()=>parseCommand(['migration-preflight','/tmp/router']));
});
