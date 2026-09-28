#!/usr/bin/env node
import { readConfig } from '../src/config.mjs';
import { startOpenCode } from '../src/opencode.mjs';
import { createBridge } from '../src/server.mjs';

const command = process.argv[2] || 'serve';
if (['--help', '-h', 'help'].includes(command)) {
  console.log(`codex-opencode-bridge v0.1.0\n\nCommands:\n  serve   Start an authenticated local bridge and OpenCode v2\n  init    Create a private local token and print its file path\n\nConfiguration: BRIDGE_MODE, BRIDGE_PORT, OPENCODE_PORT, OPENCODE_BIN, BRIDGE_MODELS,\nBRIDGE_STATE_DIR, BRIDGE_TOKEN, BRIDGE_TIMEOUT_MS, BRIDGE_MAX_BODY_BYTES.\nSee README.md. No client configuration is edited automatically.`);
} else if (!['serve', 'init'].includes(command)) {
  console.error('Unknown command. Use --help.'); process.exitCode = 1;
} else {
  let runtime, bridge;
  try {
    const config = readConfig();
    if (command === 'init') {
      console.log(process.env.BRIDGE_TOKEN ? 'Using BRIDGE_TOKEN from the environment.' : `Local token file: ${config.tokenPath}`);
    } else {
      runtime = await startOpenCode(config);
      bridge = createBridge(config, runtime.backend);
      await bridge.listen();
      console.log(`Bridge ready at http://${config.host}:${config.port}/v1 (${config.mode}).`);
      console.log(process.env.BRIDGE_TOKEN ? 'Authentication: BRIDGE_TOKEN.' : `Authentication token file: ${config.tokenPath}`);
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
