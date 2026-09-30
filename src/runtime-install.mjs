import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=fileURLToPath(new URL('../runtime/',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const version='2.0.18';
const relativeBinary='node_modules/@opencode/cli/bin/opencode.exe';
const marker='bridge-runtime.json';
const fail=message=>{throw new Error(message);};

// Managed, versioned dependency only. No global npm install, credentials or
// client configuration changes. Stage first; publish only a verified runtime.
export function installRuntime({directory=path.join(os.homedir(),'.local/share/codex-opencode-bridge/runtimes'),
 platform=process.platform,arch=process.arch,run=spawnSync,env=process.env}={}){
 if(platform!=='darwin'||!['arm64','x64'].includes(arch))fail('Managed runtime installation currently supports macOS arm64/x64 only.');
 const root=path.resolve(directory),target=path.join(root,`opencode-${version}-${arch}`);
 const packageBytes=fs.readFileSync(path.join(source,'package.json'));
 const lockBytes=fs.readFileSync(path.join(source,'package-lock.json'));
 const fingerprint=hash(Buffer.concat([packageBytes,lockBytes]));
 const validate=dir=>{
  const binary=path.join(dir,relativeBinary);
  const result=run(binary,['--version'],{env,encoding:'utf8',timeout:15000});
  if(result.status!==0||!new RegExp(`(?:^|[^0-9])${version.replaceAll('.','\\.')}\\b`).test(String(result.stdout)))fail('Installed OpenCode did not report the required version.');
  return {binary,sha256:hash(fs.readFileSync(binary))};
 };
 if(fs.existsSync(target)){
  if(fs.lstatSync(target).isSymbolicLink())fail('Managed runtime directory must not be a symbolic link.');
  let receipt;try{receipt=JSON.parse(fs.readFileSync(path.join(target,marker)));}catch{fail('Runtime directory exists without a valid ownership record; leaving it unchanged.');}
  if(receipt.kind!=='codex-opencode-managed-runtime'||receipt.fingerprint!==fingerprint)fail('Existing runtime ownership/version differs; leaving it unchanged.');
  const actual=validate(target);
  if(actual.sha256!==receipt.binarySha256)fail('Managed runtime binary changed; leaving it unchanged for diagnosis.');
  return {directory:target,binary:actual.binary,version,reused:true};
 }
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const lock=path.join(root,'.install-lock');
 let locked=false,stage;
 try{
  try{fs.mkdirSync(lock,{mode:0o700});locked=true;}catch(error){if(error.code==='EEXIST')fail('Another runtime installation may be active. Retry after it finishes; do not delete its lock while running.');throw error;}
  stage=fs.mkdtempSync(path.join(root,'.staging-'));
  fs.chmodSync(stage,0o700);
  fs.writeFileSync(path.join(stage,'package.json'),packageBytes,{mode:0o600});
  fs.writeFileSync(path.join(stage,'package-lock.json'),lockBytes,{mode:0o600});
  // npm verifies integrity from the repository lockfile. The official package's
  // postinstall selects its matching platform binary; its output is not logged.
  const result=run('npm',['ci','--omit=dev','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],
   {cwd:stage,env,encoding:'utf8',timeout:300000,maxBuffer:2*1024*1024});
  if(result.status!==0)fail('Official OpenCode runtime installation failed. Check npm/network access and retry; no client configuration was changed.');
  const actual=validate(stage);
  fs.writeFileSync(path.join(stage,marker),JSON.stringify({kind:'codex-opencode-managed-runtime',version,fingerprint,binarySha256:actual.sha256},null,2)+'\n',{mode:0o600});
  if(fs.existsSync(target))fail('Runtime destination appeared during installation; leaving it unchanged.');
  fs.renameSync(stage,target);stage=undefined;
  return {directory:target,binary:path.join(target,relativeBinary),version,reused:false};
 }finally{
  if(stage)fs.rmSync(stage,{recursive:true,force:true});
  if(locked)fs.rmdirSync(lock);
 }
}
