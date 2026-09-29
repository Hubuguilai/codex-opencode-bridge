// Real-runtime recovery with no inference: one journaled session, one absent
// intent, and one unrelated control. All state is temporary and independently owned.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareDirectory, preparedEnvironment, removePreparedDirectory} from '../src/setup.mjs';
import {readConfig} from '../src/config.mjs';
import {startOpenCode} from '../src/opencode.mjs';

if (!process.argv.includes('--live-runtime')) throw new Error('Use --live-runtime. No model prompts are sent.');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-recovery-probe-')));
const directory = path.join(root, 'prepared');
const hash = createHash('sha256');
for (const folder of ['src', 'bin']) for (const name of fs.readdirSync(new URL(`../${folder}/`, import.meta.url)).filter(x => x.endsWith('.mjs')).sort()) {
  hash.update(`${folder}/${name}`); hash.update(fs.readFileSync(new URL(`../${folder}/${name}`, import.meta.url)));
}
const receipt = {date: new Date().toISOString(), sourceAndCliSha256: hash.digest('hex'), modelGenerations: 0, checks: {}};
const id = () => 'ses_' + randomUUID().replaceAll('-', '');
const owned = id(), absent = id(), sentinel = id();
let runtime, env, config;
try {
  prepareDirectory(directory, {port: 5296, upstreamPort: 5297});
  env = preparedEnvironment(directory); config = {...readConfig(env), mode: 'text'};
  runtime = await startOpenCode(config, env);
  receipt.opencode = (await runtime.backend.health()).version;
  const oldDirectory = runtime.backend.directory;
  runtime.backend.journal.begin(owned); runtime.backend.journal.begin(absent);
  for (const [sessionID, location] of [[owned, oldDirectory], [sentinel, root]]) {
    await runtime.backend.call('/api/session', {method: 'POST', body: {id: sessionID, title: 'Temporary recovery control', location: {directory: location}, model: {providerID: 'opencode', id: 'space-bunny-free'}, agent: 'plan'}});
  }
  await runtime.stop(); runtime = null;
  assert.ok(fs.existsSync(oldDirectory));
  receipt.checks.stoppedRuntimeRetainedIntents = true;
  const cli = fileURLToPath(new URL('../bin/bridge.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'recover-prepared', directory], {env, encoding: 'utf8', timeout: 60000});
  assert.equal(result.status, 0, 'Recovery CLI failed');
  const report = JSON.parse(result.stdout);
  assert.equal(report.complete, true); assert.equal(report.results.length, 1); assert.equal(report.results[0].cleared, 2);
  assert.equal(fs.existsSync(oldDirectory), false);
  receipt.checks.recoveryCLICompleted = true; receipt.checks.existingAndAbsentIntentsCleared = true; receipt.checks.oldWorkDirectoryRemoved = true;
  runtime = await startOpenCode(config, env);
  for (const sessionID of [owned, absent]) await assert.rejects(runtime.backend.call('/api/session/' + sessionID), error => error.upstreamStatus === 404);
  assert.equal((await runtime.backend.call('/api/session/' + sentinel)).data.id, sentinel);
  receipt.checks.ownedSessionsAbsent = true; receipt.checks.unrelatedSessionPreserved = true;
  await runtime.backend.call('/api/session/' + sentinel, {method: 'DELETE'});
  await runtime.stop(); runtime = null;
  removePreparedDirectory(directory); receipt.checks.preparationRemovable = !fs.existsSync(directory);
  receipt.passed = true;
} catch {
  receipt.passed = false; receipt.error = 'recovery_probe_failed'; process.exitCode = 1;
} finally {
  // Only this probe's exact IDs are used for cleanup; never enumerate user sessions.
  if (!receipt.passed && !runtime && config) try { runtime = await startOpenCode(config, env); } catch {}
  if (runtime) {
    for (const sessionID of [owned, absent, sentinel]) await runtime.backend.call('/api/session/' + sessionID, {method: 'DELETE'}).catch(() => {});
    await runtime.stop();
  }
  fs.rmSync(root, {recursive: true, force: true});
  const output = process.env.BRIDGE_RECEIPT || 'generated/recovery-probe.json';
  fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}
