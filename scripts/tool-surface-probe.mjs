// Explicit live A/B probe. Only schema names/statuses are persisted, never secrets.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readConfig} from '../src/config.mjs';
import {startOpenCode} from '../src/opencode.mjs';

if (!process.argv.includes('--live')) throw new Error('Live upstream use requires --live.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-surface-'));
const model = process.env.BRIDGE_TEST_MODEL || 'opencode/nemotron-3-ultra-free';
const sourceHash = createHash('sha256');
for (const name of fs.readdirSync(new URL('../src/', import.meta.url)).filter(x => x.endsWith('.mjs')).sort()) {
  sourceHash.update(name); sourceHash.update(fs.readFileSync(new URL('../src/' + name, import.meta.url)));
}
const receipt = {date: new Date().toISOString(), model, sourceSha256: sourceHash.digest('hex'), scenarios: []};
const tool = {relayName:'bridge_client_echo_0', name:'echo', kind:'function', description:'Return a supplied string to the client.', parameters:{type:'object', properties:{text:{type:'string'}}, required:['text'], additionalProperties:false}};
const prompt = 'Call bridge_client_echo_0 exactly once with text equal to bridge-surface-test. Do not use any other tool.';
try {
  for (const mode of ['guarded', 'hidden', 'guarded']) {
    const config = readConfig({...process.env, BRIDGE_MODE:'native-tools', BRIDGE_INTERNAL_TOOLS:mode, BRIDGE_TOOL_TRANSPORT:'direct', BRIDGE_MODELS:model, BRIDGE_STATE_DIR:root, BRIDGE_PORT:'4796', OPENCODE_PORT:'4797'});
    const runtime = await startOpenCode(config);
    const entry = {mode, opencode:(await runtime.backend.health()).version};
    const started = Date.now();
    try {
      const result = await runtime.backend.generate({model, prompt, tools:[tool], messages:[{role:'user',content:[{type:'text',text:prompt}]}]}, {signal:AbortSignal.timeout(60000), onDelta:()=>{}});
      entry.returnedClientCall = result.calls?.[0]?.name === 'echo' && JSON.parse(result.calls[0].arguments).text === 'bridge-surface-test';
    } catch (error) { entry.error = {code:error.code || error.name, status:error.status}; }
    finally {
      entry.durationMs = Date.now() - started;
      for (const [key, filename] of [['context','bridge-tool-surface.json'],['wire','bridge-wire-surface.json'],['upstream','bridge-wire-status.json']]) {
        try { const {requestId,...value} = JSON.parse(fs.readFileSync(path.join(runtime.backend.directory,filename))); entry[key] = value; } catch {}
      }
      await runtime.stop();
    }
    receipt.scenarios.push(entry); console.log(JSON.stringify(entry));
  }
} finally {
  fs.rmSync(root,{recursive:true,force:true});
  const output = process.env.BRIDGE_RECEIPT || 'generated/tool-surface-probe.json';
  fs.mkdirSync(path.dirname(output),{recursive:true}); fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
}
