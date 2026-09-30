import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {stageRelease,verifyRelease} from '../src/releases.mjs';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-release-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('Release is runnable independently, repeatable and excludes local state',t=>{
 const root=fixture(t),first=stageRelease(root);
 assert.equal(first.reused,false);assert.equal(stageRelease(root).reused,true);
 assert.deepEqual(verifyRelease(first.directory),{id:first.id,directory:first.directory,cli:first.cli});
 const command=spawnSync(process.execPath,[first.cli,'--help'],{encoding:'utf8',cwd:root});
 assert.equal(command.status,0,command.stderr);assert.match(command.stdout,/codex-opencode-bridge/);
 assert.deepEqual(fs.readdirSync(first.directory).sort(),['bin','bridge-release.json','examples','package.json','runtime','src']);
 assert.equal(fs.statSync(first.cli).mode&0o777,0o600);
});
test('Source updates create separate releases without altering the old code',t=>{
 const root=fixture(t),first=stageRelease(path.join(root,'releases'));
 const source=path.join(root,'source');fs.cpSync(first.directory,source,{recursive:true});
 fs.appendFileSync(path.join(source,'src/config.mjs'),'\n// new version\n');
 const second=stageRelease(path.join(root,'releases'),{source});
 assert.notEqual(first.id,second.id);assert.equal(verifyRelease(first.directory).id,first.id);
 assert.equal(verifyRelease(second.directory).id,second.id);
});
test('Edited, extra and symlinked release files fail instead of being overwritten',t=>{
 const root=fixture(t),first=stageRelease(root),file=path.join(first.directory,'src/config.mjs'),bytes=fs.readFileSync(file);
 fs.appendFileSync(file,'edited');assert.throws(()=>stageRelease(root),/release changed/);
 fs.writeFileSync(file,bytes);const extra=path.join(first.directory,'extra');fs.writeFileSync(extra,'user data');
 assert.throws(()=>verifyRelease(first.directory),/release changed/);fs.unlinkSync(extra);
 fs.unlinkSync(file);fs.symlinkSync('/etc/hosts',file);assert.throws(()=>verifyRelease(first.directory),/symbolic/);
});
