// Disposable rehearsal subprocess only. Never installed as a service or CLI.
import fs from 'node:fs';import path from 'node:path';
import {migrateDesktop} from '../src/desktop-migration.mjs';
import {loadRouter,adoptLegacyRouterRoute} from '../src/router-registration.mjs';
import {restoreLegacyRouterRoute} from '../src/legacy-route-recovery.mjs';
import {checkBridge} from '../src/desktop-install.mjs';
import {retireLegacyService} from '../src/legacy-service.mjs';
const [root,routerRoot,binary,checkpoint]=process.argv.slice(2);
if(!root||root!==process.env.BRIDGE_MIGRATION_CHILD||!path.basename(root).startsWith('bridge-migration-rehearsal-'))throw Error('Crash worker requires its isolated rehearsal parent.');
const directory=path.join(root,'installation'),tx=JSON.parse(fs.readFileSync(path.join(directory,'desktop-migration.json'))),kill=()=>process.kill(process.pid,'SIGKILL');
const api=await loadRouter(routerRoot);
if(path.resolve(api.paths.STATE_DIR)!==path.join(root,'router-state'))throw Error('Crash worker Router state is not isolated.');
const wrapped={...api,providers:{...api.providers,updateGenericProvider:(...args)=>{const result=api.providers.updateGenericProvider(...args);if(checkpoint==='provider_written')kill();return result;}},users:{...api.users,writeUserModels:(...args)=>{const result=api.users.writeUserModels(...args);if(checkpoint==='models_written')kill();return result;}}};
if(checkpoint==='preparation_partial'){
 const write=fs.writeFileSync;fs.writeFileSync=(file,...args)=>{const result=write(file,...args);if(file===path.join(directory,'prepared/models.json'))kill();return result;};
}
if(checkpoint==='complete_before_install_record'){
 const rename=fs.renameSync;fs.renameSync=(from,to)=>{const result=rename(from,to);if(to===path.join(directory,'desktop-migration.json')&&JSON.parse(fs.readFileSync(to)).status==='complete')kill();return result;};
}
const deps={loadRouter:async()=>wrapped,installRuntime:async()=>({binary}),
 checkBridge:async prepared=>{const result=await checkBridge(prepared);if(checkpoint==='candidate_healthy')kill();return result;},
 adoptLegacyRouterRoute:async(dir,options)=>{const result=await adoptLegacyRouterRoute(dir,{...options,restart:false});if(checkpoint==='route_published')kill();return result;},
 restoreLegacyRouterRoute:(dir,options)=>restoreLegacyRouterRoute(dir,{...options,restart:false}),
 retireLegacyService:async(...args)=>{const result=await retireLegacyService(...args);if(checkpoint==='legacy_retired')kill();return result;}};
await migrateDesktop({directory,routerRoot,legacyPlist:tx.legacy.plist},deps);
throw Error('Requested crash checkpoint was not reached.');
