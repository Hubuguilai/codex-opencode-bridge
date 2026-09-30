import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {preparedEnvironment} from './setup.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
const xml=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cli=fileURLToPath(new URL('../bin/bridge.mjs',import.meta.url));
const fail=x=>{throw new Error(x);};
function context(directory,{home=os.homedir(),platform=process.platform,uid=process.getuid?.(),run=spawnSync}={}){
 if(platform!=='darwin')fail('Managed services currently support macOS only.');
 const prepared=path.resolve(directory),id=digest(prepared).slice(0,16);
 const label='io.codex-opencode-bridge.'+id;
 const root=path.join(home,'.local/share/codex-opencode-bridge/services',id);
 const plist=path.join(home,'Library/LaunchAgents',label+'.plist');
 return {prepared,label,root,plist,receipt:path.join(root,'service.json'),target:`gui/${uid}/${label}`,domain:`gui/${uid}`,run};
}
function command(c,args){return c.run('launchctl',args,{encoding:'utf8',timeout:15000});}

async function bootstrap(c){
 // launchd can acknowledge bootout before it permits the same label to be
 // bootstrapped again. Retry only its transient EIO response, never provider calls.
 for(let attempt=0;attempt<20;attempt++){
  const result=command(c,['bootstrap',c.domain,c.plist]);
  if(result.status===0)return;
  if(result.status!==5||attempt===19)throw Error('macOS could not load the bridge service (launchctl status '+result.status+').');
  await new Promise(resolve=>setTimeout(resolve,250));
 }
}

function owned(c){
 let receipt;try{receipt=JSON.parse(fs.readFileSync(c.receipt));}catch{fail('No managed service record; refusing to change this service.');}
 if(receipt.kind!=='codex-opencode-bridge-service'||receipt.prepared!==c.prepared||receipt.plist!==c.plist)fail('Invalid service ownership record.');
 if(!fs.existsSync(c.plist)||fs.lstatSync(c.plist).isSymbolicLink()||digest(fs.readFileSync(c.plist))!==receipt.sha256)fail('Service configuration changed; preserve edits before changing it.');
 return receipt;
}
export async function availablePort(port){
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(new Error(`Port ${port} is occupied; choose unused bridge and OpenCode ports.`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
}
export function serviceStatus(directory,options={}){
 const c=context(directory,options);
 if(!fs.existsSync(c.receipt))return {installed:false,running:false};
 owned(c);const result=command(c,['print',c.target]);
 return {installed:true,loaded:result.status===0,running:result.status===0&&/state = running/.test(result.stdout||''),label:c.label};
}
export async function installService(directory,{binary,node=process.execPath,cli:entrypoint=cli,env=process.env,checkPort=availablePort,...options}={}){
 const c=context(directory,options),prepared=preparedEnvironment(c.prepared,{});
 if(!binary||!path.isAbsolute(binary))fail('Provide the absolute managed OpenCode executable path.');
 if(!path.isAbsolute(entrypoint)||!fs.lstatSync(entrypoint).isFile()||fs.lstatSync(entrypoint).isSymbolicLink())fail('Provide a regular absolute bridge entrypoint.');
 fs.accessSync(binary,fs.constants.X_OK);fs.accessSync(node,fs.constants.X_OK);
 if(fs.existsSync(c.receipt)){
  const receipt=owned(c);
  if(receipt.binary!==binary||receipt.node!==node||receipt.cli!==entrypoint)fail('Service paths changed; stop and remove the managed service before reinstalling.');
  const status=serviceStatus(directory,options);
  if(!status.loaded)await bootstrap(c);
  return {...serviceStatus(directory,options),reused:true};
 }
 if(fs.existsSync(c.plist))fail('A service file already exists without ownership; leaving it unchanged.');
 await checkPort(Number(prepared.BRIDGE_PORT));await checkPort(Number(prepared.OPENCODE_PORT));
 fs.mkdirSync(c.root,{recursive:true,mode:0o700});fs.mkdirSync(path.dirname(c.plist),{recursive:true});
 const args=[node,entrypoint,'serve-prepared',c.prepared];
 // Credentials stay in OpenCode's own store and bridge state, never the plist.
 const environment={PATH:env.PATH||'/usr/bin:/bin:/usr/sbin:/sbin',OPENCODE_BIN:binary};
 const content=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${xml(c.label)}</string><key>ProgramArguments</key><array>${args.map(x=>`<string>${xml(x)}</string>`).join('')}</array><key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([k,v])=>`<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${xml(path.join(c.root,'service.log'))}</string><key>StandardErrorPath</key><string>${xml(path.join(c.root,'error.log'))}</string></dict></plist>\n`;
 fs.writeFileSync(c.plist,content,{flag:'wx',mode:0o600});
 const receipt={kind:'codex-opencode-bridge-service',prepared:c.prepared,plist:c.plist,binary,node,cli:entrypoint,servicePath:environment.PATH,sha256:digest(content)};
 try{
  fs.writeFileSync(c.receipt,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  await bootstrap(c);
 }catch(error){
  // No pre-existing service is touched. Preserve logs for diagnosis.
  command(c,['bootout',c.target]);fs.rmSync(c.plist,{force:true});fs.rmSync(c.receipt,{force:true});throw error;
 }
 return {...serviceStatus(directory,options),reused:false};
}
export function removeService(directory,options={}){
 const c=context(directory,options);if(!fs.existsSync(c.receipt)&&!fs.existsSync(c.plist))return {removed:true,alreadyAbsent:true};
 owned(c);
 if(command(c,['print',c.target]).status===0&&command(c,['bootout',c.target]).status!==0)fail('Could not stop the managed service; configuration retained.');
 fs.unlinkSync(c.plist);fs.unlinkSync(c.receipt);
 return {removed:true,logsPreserved:true,preparationPreserved:true};
}

export function serviceConfiguration(directory,options={}){return {...owned(context(directory,options))};}
