// Verify the distributable, not a source checkout. No registry, provider API,
// global install, active client configuration or installed OpenCode is required.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const project=fileURLToPath(new URL('../',import.meta.url));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bridge-package-')));
const output=path.resolve(process.env.BRIDGE_RECEIPT||path.join(project,'generated/package-check.json'));
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('BRIDGE_'))),npm_config_cache:path.join(root,'npm-cache'),npm_config_offline:'true'};
const receipt={date:new Date().toISOString(),node:process.version,platform:process.platform,checks:{},providerRequests:0};
const run=(command,args,cwd=project,extra={})=>{
 const result=spawnSync(command,args,{cwd,env:{...env,...extra},encoding:'utf8',timeout:60000});
 assert.equal(result.error,undefined,'Command must complete within its deadline');
 assert.equal(result.status,0,'Package verification command failed: '+path.basename(command)+' '+args[0]);return result.stdout;
};
try{
 const [pack]=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',root]));
 const paths=pack.files.map(file=>file.path);
 assert.ok(paths.length>0);
 const required=['src/service.mjs','runtime/package.json','runtime/package-lock.json','src/runtime-install.mjs','bin/bridge.mjs','src/runtime-plugin.mjs','src/client-aliases.mjs','src/recovery.mjs','examples/native-models.json','README.md','docs/README.zh-CN.md','LICENSE'];
 for(const file of required)assert.ok(paths.includes(file),'Required packaged asset missing: '+file);
 const forbidden=/(^|\/)(?:generated|node_modules|\.git|\.codex|\.env(?:\..*)?|auth\.json|local-token|bridge-env\.json|install-manifest\.json|generic-providers\.json|user-models\.json|merged-models\.json)(?:\/|$)|\.(?:key|log)$/;
 assert.ok(paths.every(file=>!path.isAbsolute(file)&&!file.split('/').includes('..')&&!forbidden.test(file)),'Local runtime/private state must not be packaged');
 receipt.checks.requiredAssets=true;receipt.checks.noLocalStateFiles=true;
 const tarball=path.join(root,pack.filename),install=path.join(root,'installed');fs.mkdirSync(install);
 fs.writeFileSync(path.join(install,'package.json'),JSON.stringify({name:'bridge-package-check',private:true}));
 run('npm',['install','--prefix',install,'--global=false','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false',tarball],install);
 const installed=path.join(install,'node_modules/codex-opencode-bridge');
 const manifest=JSON.parse(fs.readFileSync(path.join(installed,'package.json')));
 assert.equal(Object.keys(manifest.dependencies||{}).length,0);
 for(const file of paths){
  const text=fs.readFileSync(path.join(installed,file),'utf8');
  assert.ok(!/sk-[A-Za-z0-9]{20,}|\/Users\/[^\s/]+\/|\/var\/folders\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),'Potential credential or personal path in packaged file: '+file);
 }
 receipt.checks.noKnownCredentialOrPersonalPathPatterns=true;
 receipt.checks.offlineDependencyFreeInstall=true;
 const cli=path.join(install,'node_modules/.bin/codex-opencode-bridge');
 const cliEnv={BRIDGE_STATE_DIR:path.join(root,'local-state'),OPENCODE_BIN:path.join(root,'must-not-launch')};
 assert.match(run(cli,['--help'],root,cliEnv),/recover-prepared/);
 assert.equal(fs.existsSync(cliEnv.BRIDGE_STATE_DIR),false);receipt.checks.installedBinHelpWithoutState=true;
 run(cli,['init'],root,cliEnv);
 const token=path.join(cliEnv.BRIDGE_STATE_DIR,'local-token');
 assert.ok(fs.readFileSync(token,'utf8').trim().length>=24);assert.equal(fs.statSync(token).mode&0o777,0o600);receipt.checks.privateLocalToken=true;
 const models=['opencode/space-bunny-free','opencode/nemotron-3-ultra-free','opencode/mimo-v2.6-flash-free','opencode/longcat-2.5-preview-free','opencode/big-pickle'];
 const source=path.join(root,'native-models.json'),original='{"models":[{"slug":"native-sentinel","display_name":"Preserve me"}]}\n';fs.writeFileSync(source,original);
 const prepared=path.join(root,'five model preparation');
 const result=JSON.parse(run(cli,['prepare',prepared,'--models',models.join(','),'--catalog',source],root,cliEnv));
 assert.deepEqual(result.models,models);assert.equal(fs.readFileSync(source,'utf8'),original);
 const catalog=JSON.parse(fs.readFileSync(path.join(prepared,'models.json')));assert.equal(catalog.models.length,6);assert.deepEqual(catalog.models[0],JSON.parse(original).models[0]);
 receipt.checks.fiveModelPreparationWithPreservation=true;
 const musePrepared=path.join(root,'muse preparation');
 run(cli,['prepare',musePrepared,'--models','opencode/big-pickle,opencode/muse-spark-1.3-contributor-free'],root,cliEnv);
 const museCatalog=JSON.parse(fs.readFileSync(path.join(musePrepared,'models.json'))).models;
 assert.equal(museCatalog[1].context_window,1048576);assert.deepEqual(museCatalog[1].input_modalities,['text','image']);
 assert.equal(museCatalog[0].context_window,200000);
 const museEnv=JSON.parse(fs.readFileSync(path.join(musePrepared,'bridge-env.json')));
 assert.equal(museEnv.BRIDGE_IMAGE_MODELS,'opencode/muse-spark-1.3-contributor-free');
 run(cli,['remove-prepared',musePrepared],root,cliEnv);assert.equal(fs.existsSync(musePrepared),false);
 receipt.checks.museVisionPreparation=true;

 const router=path.join(root,'mock-router');fs.mkdirSync(router);
 fs.writeFileSync(path.join(router,'generic-providers.json'),'{"providers":[]}');fs.writeFileSync(path.join(router,'user-models.json'),'{"models":[]}');fs.writeFileSync(path.join(router,'merged-models.json'),original);
 const plan=JSON.parse(run(cli,['prepare-router',path.join(root,'plan'),'--prepared',prepared,'--router-state',router],root,cliEnv));
 assert.equal(plan.applied,false);
 assert.equal(plan.addedModels,5);assert.equal(plan.totalModels,6);
 assert.equal(fs.readFileSync(path.join(router,'merged-models.json'),'utf8'),original);
 receipt.checks.installedRouterPlanExport=true;
 assert.equal(JSON.parse(run(cli,['remove-prepared',prepared],root,cliEnv)).removed,true);
 assert.equal(fs.existsSync(prepared),false);receipt.checks.installedRemoval=true;
 receipt.package={name:pack.name,version:pack.version,files:pack.entryCount,compressedBytes:pack.size,sha256:createHash('sha256').update(fs.readFileSync(tarball)).digest('hex')};
 receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.split('\n')[0].replaceAll(root,'<temporary-workspace>');process.exitCode=1;}
finally{
 fs.rmSync(root,{recursive:true,force:true});
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}
