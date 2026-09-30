#!/usr/bin/env node
import {installationStatus} from '../src/installation-status.mjs';
import {installDesktop,uninstallDesktop} from '../src/desktop-install.mjs';
import {loadRouter,registerRouter,unregisterRouter} from '../src/router-registration.mjs';
import {installService,serviceStatus,removeService} from '../src/service.mjs';
import {installRuntime} from '../src/runtime-install.mjs';
import {doctor} from '../src/doctor.mjs';
import { prepareRouterPlan } from '../src/router-plan.mjs';
import { prepareDirectory, removePreparedDirectory, preparedEnvironment } from '../src/setup.mjs';
import { readConfig } from '../src/config.mjs';
import { startOpenCode } from '../src/opencode.mjs';
import { createBridge } from '../src/server.mjs';
import { parseCommand } from '../src/cli.mjs';
import { recoverSessions } from '../src/recovery.mjs';

let invocation;
try { invocation = parseCommand(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exit(1); }
const {command, directory, options} = invocation;
if (command === 'help') {
  console.log(`codex-opencode-bridge v0.2.0-rc.1\n\nCommands:\n  status [--directory DIR]  Read-only service, health and model publication checks\n  install [--directory DIR] [--router-root DIR] [--models ID,ID]  Install bridge and bootstrap Router when absent\n  uninstall [--directory DIR]  Remove this managed bridge registration and service\n  register-router PLAN_DIR --router-root DIR  Register models through the installed Router\n  unregister-router PLAN_DIR --router-root DIR  Remove this registration while preserving other models\n  install-service DIR --binary PATH  Start a managed macOS bridge service\n  service-status DIR  Inspect the managed service\n  remove-service DIR  Stop and remove only its service registration\n  install-runtime [--directory DIR]  Install an isolated pinned official OpenCode runtime\n  doctor  Read-only prerequisite and supported-model checks\n  serve   Start an authenticated local bridge and OpenCode v2\n  serve-prepared DIR  Start a reviewed preparation without manual environment settings\n  init    Create a private local token and print its file path\n  prepare DIR [--models ID,ID] [--model DEFAULT_ID] [--catalog PATH]  Prepare isolated config files\n  prepare-router DIR --prepared DIR --router-state DIR  Export a read-only desktop integration plan\n  recover-prepared DIR  Clean verified abandoned bridge sessions without generating text\n  remove-prepared DIR  Remove unmodified prepared files after stopping service\n\nConfiguration: BRIDGE_MODE, BRIDGE_PORT, OPENCODE_PORT, OPENCODE_BIN, BRIDGE_MODELS,\nBRIDGE_STATE_DIR, BRIDGE_TOKEN, BRIDGE_TIMEOUT_MS, BRIDGE_MAX_BODY_BYTES.\nSee README.md. No client configuration is edited automatically.`);
} else if (command==='status') {
 try {const result=await installationStatus({directory:options.directory});console.log(JSON.stringify(result,null,2));if(!result.configurationReady)process.exitCode=1;}
 catch(error){console.error(error.message);process.exitCode=1;}
} else if (['install','uninstall'].includes(command)) {
 try {const args={directory:options.directory,routerRoot:options['router-root'],models:options.models?.split(',')};console.log(JSON.stringify(await (command==='install'?installDesktop:uninstallDesktop)(args),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
} else if (['register-router','unregister-router'].includes(command)) {
 try {const api=await loadRouter(options['router-root']);console.log(JSON.stringify(await (command==='register-router'?registerRouter:unregisterRouter)(directory,{api}),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
} else if (['install-service','service-status','remove-service'].includes(command)) {
 try {const result=command==='install-service'?await installService(directory,{binary:options.binary}):command==='service-status'?serviceStatus(directory):removeService(directory);console.log(JSON.stringify(result,null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
} else if (command === 'install-runtime') {
 try {console.log(JSON.stringify(installRuntime({directory:options.directory}),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
} else if (command === 'doctor') {
 const result=doctor();console.log(JSON.stringify(result,null,2));if(!result.prerequisitesReady)process.exitCode=1;
} else if (command === 'recover-prepared') {
  let runtime;
  try {
    const env = preparedEnvironment(directory);
    const config = {...readConfig(env), mode: 'text'};
    runtime = await startOpenCode(config, env);
    const result = await recoverSessions(config.stateDir, runtime.backend);
    console.log(JSON.stringify(result, null, 2));
    if (!result.complete) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { if (runtime) await runtime.stop(); }
} else if(command==='prepare-router') {
  try {
    console.log(JSON.stringify(prepareRouterPlan(directory,{prepared:options.prepared,routerState:options['router-state']}),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
} else if (['prepare', 'remove-prepared'].includes(command)) {
  try {
    const result = command === 'prepare' ? prepareDirectory(directory, { model: options.model, models: options.models?.split(','), catalog: options.catalog }) : removePreparedDirectory(directory);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (!['serve', 'serve-prepared', 'init'].includes(command)) {
  console.error('Unknown command. Use --help.'); process.exitCode = 1;
} else {
  let runtime, bridge;
  try {
    const env=command==='serve-prepared'?preparedEnvironment(directory):process.env;
    const config = readConfig(env);
    if (command === 'init') {
      console.log(process.env.BRIDGE_TOKEN ? 'Using BRIDGE_TOKEN from the environment.' : `Local token file: ${config.tokenPath}`);
    } else {
      runtime = await startOpenCode(config,env);
      bridge = createBridge(config, runtime.backend);
      await bridge.listen();
      console.log(`Bridge ready at http://${config.host}:${config.port}/v1 (${config.mode}).`);
      console.log(env.BRIDGE_TOKEN ? 'Authentication: BRIDGE_TOKEN.' : `Authentication token file: ${config.tokenPath}`);
      let stopping = false;
      const stop = async () => {
        if (stopping) return;
        stopping = true;
        await bridge.close(); await runtime.stop();
      };
      process.once('SIGTERM', stop); process.once('SIGINT', stop);
      runtime.child.once('exit', () => { if (!stopping) { process.exitCode = 1; void stop(); } });
    }
  } catch (error) {
    console.error(`[bridge] ${error.message}`);
    if (bridge) await bridge.close();
    if (runtime) await runtime.stop();
    process.exitCode = 1;
  }
}
