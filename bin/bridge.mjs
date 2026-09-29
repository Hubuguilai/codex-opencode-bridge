#!/usr/bin/env node
import { prepareRouterPlan } from '../src/router-plan.mjs';
import { prepareDirectory, removePreparedDirectory, preparedEnvironment } from '../src/setup.mjs';
import { readConfig } from '../src/config.mjs';
import { startOpenCode } from '../src/opencode.mjs';
import { createBridge } from '../src/server.mjs';

const command = process.argv[2] || 'serve';
if (['--help', '-h', 'help'].includes(command)) {
  console.log(`codex-opencode-bridge v0.2.0-rc.1\n\nCommands:\n  serve   Start an authenticated local bridge and OpenCode v2\n  serve-prepared DIR  Start a reviewed preparation without manual environment settings\n  init    Create a private local token and print its file path\n  prepare DIR [--models ID,ID] [--model DEFAULT_ID] [--catalog PATH]  Prepare isolated config files\n  prepare-router DIR --prepared DIR --router-state DIR  Export a read-only desktop integration plan\n  remove-prepared DIR  Remove unmodified prepared files after stopping service\n\nConfiguration: BRIDGE_MODE, BRIDGE_PORT, OPENCODE_PORT, OPENCODE_BIN, BRIDGE_MODELS,\nBRIDGE_STATE_DIR, BRIDGE_TOKEN, BRIDGE_TIMEOUT_MS, BRIDGE_MAX_BODY_BYTES.\nSee README.md. No client configuration is edited automatically.`);
} else if(command==='prepare-router') {
  try {
    const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
    if(!process.argv[3])throw new Error('Provide an explicit plan output directory.');
    console.log(JSON.stringify(prepareRouterPlan(process.argv[3],{prepared:option('--prepared'),routerState:option('--router-state')}),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
} else if (['prepare', 'remove-prepared'].includes(command)) {
  try {
    const directory = process.argv[3];
    if (!directory) throw new Error('Provide an explicit preparation directory.');
    const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
    const result = command === 'prepare' ? prepareDirectory(directory, { model: option('--model'), models: option('--models')?.split(','), catalog: option('--catalog') }) : removePreparedDirectory(directory);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else if (!['serve', 'serve-prepared', 'init'].includes(command)) {
  console.error('Unknown command. Use --help.'); process.exitCode = 1;
} else {
  let runtime, bridge;
  try {
    if(command==='serve-prepared'&&!process.argv[3])throw new Error('Provide an explicit preparation directory.');
    const env=command==='serve-prepared'?preparedEnvironment(process.argv[3]):process.env;
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
