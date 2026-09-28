import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig } from '../src/config.mjs';
import { startOpenCode } from '../src/opencode.mjs';
import { createBridge } from '../src/server.mjs';

if (!process.argv.includes('--live')) {
  console.error('This sends two real model requests using your OpenCode access. Run npm run smoke -- --live to opt in.');
  process.exit(1);
}
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-opencode-bridge-smoke-'));
let runtime, bridge;
try {
  const config = readConfig({ ...process.env, BRIDGE_STATE_DIR: stateDir });
  runtime = await startOpenCode(config);
  bridge = createBridge(config, runtime.backend);
  await bridge.listen();
  const model = config.models[0];
  const results = [];
  for (const api of ['chat/completions', 'responses']) {
    const marker = api === 'responses' ? 'BRIDGE_RESPONSES_OK' : 'BRIDGE_CHAT_OK';
    const prompt = `Reply with exactly: ${marker}`;
    const body = api === 'responses' ? { model, input: prompt, stream: true, store: false }
      : { model, messages: [{ role: 'user', content: prompt }] };
    const response = await fetch(`http://${config.host}:${config.port}/v1/${api}`, {
      method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(config.timeoutMs + 15000),
    });
    const wire = await response.text();
    const ok = response.ok && wire.includes(marker) && (api !== 'responses' || wire.includes('response.completed'));
    const errors = api === 'responses'
      ? wire.split('\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6))).filter(x => x.type === 'response.failed').map(x => x.response.error)
      : JSON.parse(wire).error;
    results.push({ api, status: response.status, markerReceived: wire.includes(marker), ok, ...(!ok ? { errors } : {}) });
    if (!ok) process.exitCode = 1;
  }
  console.log(JSON.stringify({ model, upstream: await runtime.backend.health(), results }, null, 2));
} finally {
  if (bridge) await bridge.close();
  if (runtime) await runtime.stop();
  fs.rmSync(stateDir, { recursive: true, force: true });
}
