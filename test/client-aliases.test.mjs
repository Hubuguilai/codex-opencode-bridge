import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {clientAliases} from '../src/client-aliases.mjs';
import plugin from '../src/runtime-plugin.mjs';
const target={kind:'function',name:'exec_command',namespace:'functions',relayName:'bridge_client_exec_command_0',parameters:{type:'object',properties:{cmd:{type:'string'},workdir:{type:'string'}},required:['cmd']}};

test('Aliases require a unique compatible client executor and reject unsupported timeout semantics',()=>{
 assert.deepEqual(clientAliases([]),[]);assert.deepEqual(clientAliases([target,target]),[]);
 assert.deepEqual(clientAliases([{...target,namespace:'unrelated'}]),[]);
 const shell=clientAliases([target]).find(x=>x.name==='shell');
 assert.deepEqual(shell.translate({command:'printf hello',workdir:'/tmp/client'}),{cmd:'printf hello',workdir:'/tmp/client'});
 assert.throws(()=>shell.translate({command:'sleep 10',timeout:100}),/UNSUPPORTED/);
 assert.throws(()=>shell.translate({command:'sleep 10',background:true}),/UNSUPPORTED/);
 assert.throws(()=>shell.translate({command:'x',sandbox_permissions:'require_escalated'}),/UNSUPPORTED/);
});

test('Read alias quotes hostile filenames as data and applies documented line bounds in the client',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-alias-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const name="a' $(touch INJECTED).txt";fs.writeFileSync(path.join(root,name),'alpha\nβeta\ngamma\n');
 const read=clientAliases([target]).find(x=>x.name==='read');
 const call=read.translate({path:name,offset:2,limit:1});
 const result=spawnSync('/bin/sh',['-c',call.cmd],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'2: βeta\n');assert.equal(fs.existsSync(path.join(root,'INJECTED')),false);
 assert.throws(()=>read.translate({path:name,limit:2001}),/UNSUPPORTED/);
 assert.throws(()=>read.translate({path:name,offset:0}),/UNSUPPORTED/);
});

test('Alias guard captures a Codex request and throws before any original runtime executor can run',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-alias-plugin-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'bridge-request.json'),JSON.stringify({requestId:'alias-test',internalTools:'client-aliases',tools:[target]}));
 const hooks={},registry=[{id:'shell',name:'shell',execute:()=>assert.fail('Original executor must never run')},{id:'read',name:'read'}];
 const ctx={location:{directory:root},session:{hook:async(n,f)=>{hooks['session.'+n]=f;}},permission:{hook:async(n,f)=>{hooks['permission.'+n]=f;}},tool:{hook:async(n,f)=>{hooks['tool.'+n]=f;},transform:async f=>{f({list:()=>registry,update:(id,change)=>change(registry.find(t=>t.id===id)),add:()=>{}});return{dispose:async()=>{}};}}};
 await plugin.setup(ctx);await hooks['session.prompt']();
 assert.match(registry[0].description,/Codex/);assert.equal(registry[0].input.properties.timeout,undefined);
 const permission={action:'shell'};hooks['permission.evaluate'](permission);assert.equal(permission.effect,'allow');
 assert.throws(()=>hooks['tool.execute.before']({tool:'shell',input:{command:'printf marker'}}),/CLIENT_TRANSFER_RECORDED/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'bridge-call.json'))),{requestId:'alias-test',kind:'call',relayName:target.relayName,input:{cmd:'printf marker'},alias:'shell'});
 assert.throws(()=>hooks['tool.execute.before']({tool:'webfetch',input:{url:'https://example.com'}}),/INTERNAL_TOOL_BLOCKED/);
 assert.equal(fs.existsSync(path.join(root,'never-written')),false);
});


test('File mutation aliases preserve bytes and mode, reject ambiguous edits, and keep content inert',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-alias-mutation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const aliases=clientAliases([target]);
 const run=(name,input)=>spawnSync('/bin/sh',['-c',aliases.find(x=>x.name===name).translate(input).cmd],{cwd:root,encoding:'utf8'});
 const name="sub/file' $(touch INJECTED).txt", content="βeta\r\n$(touch INJECTED)\r\nβeta\r\n";
 let result=run('write',{path:name,content});assert.equal(result.status,0,result.stderr);
 const file=path.join(root,name);assert.equal(fs.readFileSync(file,'utf8'),content);fs.chmodSync(file,0o640);
 result=run('edit',{path:name,oldString:'βeta',newString:'alpha'});assert.notEqual(result.status,0);assert.equal(fs.readFileSync(file,'utf8'),content);
 result=run('edit',{path:name,oldString:'missing',newString:'alpha'});assert.notEqual(result.status,0);assert.equal(fs.readFileSync(file,'utf8'),content);
 result=run('edit',{path:name,oldString:'βeta',newString:'alpha',replaceAll:true});assert.equal(result.status,0,result.stderr);
 assert.equal(fs.readFileSync(file,'utf8'),content.replaceAll('βeta','alpha'));assert.equal(fs.statSync(file).mode&0o777,0o640);
 assert.equal(fs.existsSync(path.join(root,'INJECTED')),false);
 assert.throws(()=>aliases.find(x=>x.name==='write').translate({path:name,content:'x'.repeat(48000)}),/INPUT_TOO_LARGE/);
});


test('Every file alias is transferred before runtime execution; unsupported parameters fail explicitly',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-alias-guard-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const hooks={},registry=['read','write','edit','shell'].map(name=>({id:name,name,execute:()=>assert.fail('Original executor invoked')}));
 const ctx={location:{directory:root},session:{hook:async(n,f)=>{hooks['session.'+n]=f;}},permission:{hook:async(n,f)=>{hooks['permission.'+n]=f;}},tool:{hook:async(n,f)=>{hooks['tool.'+n]=f;},transform:async f=>{f({list:()=>registry,update:(id,change)=>change(registry.find(x=>x.id===id)),add:()=>{}});return{dispose:async()=>{}};}}};
 await plugin.setup(ctx);
 const cases=[['read',{path:'client.txt'}],['write',{path:'client.txt',content:'new'}],['edit',{path:'client.txt',oldString:'old',newString:'new'}],['write',{path:'client.txt',unknown:true}]];
 for(const [index,[tool,input]]of cases.entries()){
  fs.writeFileSync(path.join(root,'bridge-request.json'),JSON.stringify({requestId:String(index),internalTools:'client-aliases',tools:[target]}));
  await hooks['session.prompt']();
  assert.throws(()=>hooks['tool.execute.before']({tool,input}),index===3?/CLIENT_ALIAS_UNSUPPORTED/:/CLIENT_TRANSFER_RECORDED/);
  const capture=JSON.parse(fs.readFileSync(path.join(root,'bridge-call.json')));
  assert.equal(capture.requestId,String(index));assert.equal(capture.alias,tool);
  assert.equal(capture.kind,index===3?'unsupported_alias':'call');
  if(index!==3){assert.equal(capture.relayName,target.relayName);assert.equal(typeof capture.input.cmd,'string');}
  assert.equal(fs.existsSync(path.join(root,'client.txt')),false);
 }
});
