import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {writeInstallState,acquireInstallLock} from '../src/install-state.mjs';
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'installation-lock-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('Atomic records are private and concurrent live installers cannot acquire ownership',t=>{
 const dir=root(t),file=path.join(dir,'record.json');writeInstallState(file,{phase:'one'});writeInstallState(file,{phase:'two'});
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),{phase:'two'});assert.equal(fs.statSync(file).mode&0o777,0o600);
 const release=acquireInstallLock(dir);assert.throws(()=>acquireInstallLock(dir),/active/);release();
 assert.deepEqual(fs.readdirSync(dir),['record.json']);
});
test('A verified dead installer lock can be recovered but unknown files are retained',t=>{
 const dir=root(t),lock=path.join(dir,'.installation-lock');fs.mkdirSync(lock);writeInstallState(path.join(lock,'owner.json'),{pid:999999,id:'dead'});
 const release=acquireInstallLock(dir,{alive:()=>false});release();
 fs.mkdirSync(lock);writeInstallState(path.join(lock,'owner.json'),{pid:999999,id:'dead'});fs.writeFileSync(path.join(lock,'user-file'),'keep');
 assert.throws(()=>acquireInstallLock(dir,{alive:()=>false}),/unknown files/);assert.equal(fs.readFileSync(path.join(lock,'user-file'),'utf8'),'keep');
});
