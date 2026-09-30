import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {installRuntime} from '../src/runtime-install.mjs';
const binary='node_modules/@opencode/cli/bin/opencode.exe';
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-install-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return {directory,platform:'darwin',arch:'arm64'};}
function runner({failure=false,wrongVersion=false}={}){return (cmd,args,opts)=>{
 if(cmd==='npm'){
  assert.equal(args[0],'ci');assert.ok(fs.existsSync(path.join(opts.cwd,'package-lock.json')));
  if(failure)return {status:1,stderr:'private sensitive diagnostics'};
  fs.mkdirSync(path.dirname(path.join(opts.cwd,binary)),{recursive:true});fs.writeFileSync(path.join(opts.cwd,binary),'binary');return {status:0};
 }
 return {status:0,stdout:'opencode v'+(wrongVersion?'2.0.19':'2.0.18')};
};}
test('Managed runtime installation publishes validated dependency and reuses unchanged files',t=>{
 const opts=fixture(t),run=runner();const first=installRuntime({...opts,run});
 assert.equal(first.reused,false);assert.equal(fs.statSync(first.directory).mode&0o777,0o700);
 const second=installRuntime({...opts,run:(cmd,...args)=>{assert.notEqual(cmd,'npm');return run(cmd,...args);}});
 assert.equal(second.reused,true);assert.equal(second.binary,first.binary);
 fs.writeFileSync(first.binary,'tampered');assert.throws(()=>installRuntime({...opts,run}),/binary changed/);
});
test('Failed download or version check leaves no half-installed runtime or lock',t=>{
 const opts=fixture(t);
 for(const config of [{failure:true},{wrongVersion:true}]){
  assert.throws(()=>installRuntime({...opts,run:runner(config)}),/failed|required version/);
  assert.deepEqual(fs.readdirSync(opts.directory),[]);
 }
});
test('Unowned directories, competing installs and unsupported platforms stay unchanged',t=>{
 const opts=fixture(t);const target=path.join(opts.directory,'opencode-2.0.18-arm64');
 fs.mkdirSync(target);fs.writeFileSync(path.join(target,'keep'),'mine');
 assert.throws(()=>installRuntime({...opts,run:runner()}),/ownership/);
 assert.equal(fs.readFileSync(path.join(target,'keep'),'utf8'),'mine');fs.rmSync(target,{recursive:true});
 fs.mkdirSync(path.join(opts.directory,'.install-lock'));
 assert.throws(()=>installRuntime({...opts,run:runner()}),/active/);
 assert.ok(fs.existsSync(path.join(opts.directory,'.install-lock')));
 assert.throws(()=>installRuntime({...opts,platform:'linux'}),/macOS/);
});
