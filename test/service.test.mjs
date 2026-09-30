import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDirectory} from '../src/setup.mjs';
import {installService,serviceStatus,removeService} from '../src/service.mjs';
function fixture(t,{bootstrapFails=false}={}){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-service-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const directory=path.join(home,'prepared & spaces');prepareDirectory(directory,{model:'opencode/big-pickle'});
 let loaded=false;const calls=[];
 const run=(cmd,args)=>{calls.push(args);if(args[0]==='print')return {status:loaded?0:1,stdout:loaded?'state = running':''};if(args[0]==='bootstrap'){if(bootstrapFails)return {status:1};loaded=true;}if(args[0]==='bootout')loaded=false;return {status:0};};
 const opts={home,platform:'darwin',uid:501,run,binary:process.execPath,checkPort:async()=>{},env:{PATH:'/bin',OPENAI_API_KEY:'do-not-persist'}};
 return {home,directory,opts,calls};
}
test('Service installation is repeatable and removal preserves configuration and logs',async t=>{
 const f=fixture(t);const first=await installService(f.directory,f.opts);assert.equal(first.running,true);
 const plist=path.join(f.home,'Library/LaunchAgents',first.label+'.plist');const text=fs.readFileSync(plist,'utf8');
 assert.match(text,/prepared &amp; spaces/);assert.ok(!text.includes('do-not-persist'));
 assert.equal((await installService(f.directory,f.opts)).reused,true);
 assert.equal(f.calls.filter(x=>x[0]==='bootstrap').length,1);
 const before=fs.readFileSync(path.join(f.directory,'bridge-env.json'));
 assert.equal(removeService(f.directory,f.opts).removed,true);
 assert.deepEqual(fs.readFileSync(path.join(f.directory,'bridge-env.json')),before);
 assert.equal(serviceStatus(f.directory,f.opts).installed,false);
 assert.equal(removeService(f.directory,f.opts).alreadyAbsent,true);
});
test('Failed bootstrap rolls back registration without deleting the prepared token',async t=>{
 const f=fixture(t,{bootstrapFails:true});await assert.rejects(installService(f.directory,f.opts),/could not load/);
 assert.deepEqual(fs.readdirSync(path.join(f.home,'Library/LaunchAgents')),[]);
 assert.ok(fs.existsSync(path.join(f.directory,'state/local-token')));
});
test('Edited service files and occupied ports are not overwritten',async t=>{
 const f=fixture(t);const first=await installService(f.directory,f.opts);
 const file=path.join(f.home,'Library/LaunchAgents',first.label+'.plist');fs.appendFileSync(file,'user edit');
 assert.throws(()=>removeService(f.directory,f.opts),/configuration changed/);
 await assert.rejects(installService(f.directory,f.opts),/configuration changed/);
 const other=path.join(f.home,'other');prepareDirectory(other,{model:'opencode/big-pickle'});
 await assert.rejects(installService(other,{...f.opts,checkPort:async()=>{throw Error('Port occupied');}}),/Port occupied/);
 assert.equal(fs.readdirSync(path.dirname(file)).length,1);
});

test('Service uses the selected release entrypoint and refuses an implicit version switch',async t=>{
 const f=fixture(t);const cli=path.join(f.home,'release.mjs');fs.writeFileSync(cli,'// fixture');
 const first=await installService(f.directory,{...f.opts,cli});
 const text=fs.readFileSync(path.join(f.home,'Library/LaunchAgents',first.label+'.plist'),'utf8');
 assert.ok(text.includes(cli));
 assert.equal((await installService(f.directory,{...f.opts,cli})).reused,true);
 await assert.rejects(installService(f.directory,f.opts),/Service paths changed/);
 removeService(f.directory,f.opts);
});
