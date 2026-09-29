// Deterministic late-commit + driver-crash probe. Uses official OpenCode, but
// never sends a model prompt. Run only against the temporary preparation here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {prepareDirectory, preparedEnvironment, removePreparedDirectory} from '../src/setup.mjs';
import {readConfig} from '../src/config.mjs';
import {startOpenCode, OpenCodeBackend} from '../src/opencode.mjs';
import {processAbsent} from '../src/runtime-ownership.mjs';

if (!process.argv.includes('--live-runtime')) throw new Error('Use --live-runtime. No model generation is performed.');
const self = fileURLToPath(import.meta.url);
function nextMessage(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('worker_timeout')), 30000);
    const message = value => finish(null, value);
    const exit = () => finish(new Error('worker_exited'));
    const finish = (error, value) => {
      clearTimeout(timer); child.off('message', message); child.off('exit', exit);
      if (error) reject(error); else resolve(value);
    };
    child.once('message', message); child.once('exit', exit);
  });
}

async function worker(directory) {
  const env = preparedEnvironment(directory), config = {...readConfig(env), mode: 'text'};
  const runtime = await startOpenCode(config, env);
  let proxy, staged, deletionBeforeCommit = false, prompts = 0;
  const sentinel = 'ses_' + randomUUID().replaceAll('-', '');
  try {
    await runtime.backend.call('/api/session', {method: 'POST', body: {id: sentinel, title: 'Unrelated crash probe control', location: {directory: path.dirname(directory)}, agent: 'plan', model: {providerID: 'opencode', id: 'space-bunny-free'}}});
    proxy = http.createServer(async (req, res) => {
      try {
        let text = ''; for await (const chunk of req) text += chunk;
        if (req.url.endsWith('/prompt')) { prompts++; res.writeHead(500); res.end(); return; }
        if (req.url === '/api/session' && req.method === 'POST') {
          staged = JSON.parse(text); res.destroy(); return; // Reply lost before creation reaches OpenCode.
        }
        const response = await fetch(runtime.backend.url + req.url, {method: req.method,
          headers: {authorization: runtime.backend.authorization, 'content-type': 'application/json'},
          ...(text ? {body: text} : {}), signal: AbortSignal.timeout(5000)});
        if (req.method === 'DELETE' && response.status === 404) deletionBeforeCommit = true;
        res.writeHead(response.status, {'content-type': 'application/json'}); res.end(await response.text());
      } catch { res.destroy(); }
    });
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
    const backend = new OpenCodeBackend({url: `http://127.0.0.1:${proxy.address().port}`, password: 'probe', directory: runtime.backend.directory, journal: runtime.backend.journal});
    await assert.rejects(backend.generate({model: 'opencode/space-bunny-free', prompt: 'Must never reach an inference endpoint'}, {signal: AbortSignal.timeout(15000), onDelta: () => {}}));
    assert.ok(staged); assert.equal(prompts, 0); assert.equal(deletionBeforeCommit, true);
    // Commit after the original request's entire finally/cleanup has completed.
    await runtime.backend.call('/api/session', {method: 'POST', body: staged});
    assert.equal((await runtime.backend.call('/api/session/' + staged.id)).data.id, staged.id);
    assert.equal(runtime.backend.journal.hasPending(), true);
    const owner = JSON.parse(fs.readFileSync(path.join(runtime.backend.directory, '.bridge-runtime.json'), 'utf8'));
    assert.equal(owner.phase, 'running');
    proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); proxy = null;
    process.send({type: 'ready', owned: staged.id, sentinel, work: runtime.backend.directory, childPID: runtime.child.pid,
      opencode: (await runtime.backend.health()).version, deletionBeforeCommit, prompts});
    const [message] = await once(process, 'message');
    assert.equal(message.type, 'stop-owned-child');
    const exited = once(runtime.child, 'exit'); runtime.child.kill('SIGTERM'); await exited;
    // Deliberately omit runtime.stop(): leave phase=running for absent-PID recovery.
    process.send({type: 'child-exited'});
    await new Promise(() => { setInterval(() => {}, 1000); });
  } catch {
    if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
    for (const id of [staged?.id, sentinel].filter(Boolean)) await runtime.backend.call('/api/session/' + id, {method: 'DELETE'}).catch(() => {});
    await runtime.stop(); process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
}

async function main() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-crash-recovery-'))), directory = path.join(root, 'prepared');
  const hash = createHash('sha256');
  for (const folder of ['src', 'bin']) for (const name of fs.readdirSync(new URL(`../${folder}/`, import.meta.url)).filter(x => x.endsWith('.mjs')).sort()) {
    hash.update(`${folder}/${name}`); hash.update(fs.readFileSync(new URL(`../${folder}/${name}`, import.meta.url)));
  }
  const receipt = {date: new Date().toISOString(), sourceAndCliSha256: hash.digest('hex'), modelGenerations: 0, checks: {}};
  let child, runtime, ready, env, config;
  try {
    prepareDirectory(directory, {port: 5396, upstreamPort: 5397});
    env = preparedEnvironment(directory); config = {...readConfig(env), mode: 'text'};
    child = spawn(process.execPath, [self, '--live-runtime', '--worker', directory], {env, stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    ready = await nextMessage(child); assert.equal(ready.type, 'ready');
    assert.equal(ready.deletionBeforeCommit, true); assert.equal(ready.prompts, 0);
    receipt.opencode = ready.opencode; receipt.checks.creationCommittedAfterOriginalCleanup = true;
    const response = nextMessage(child); child.send({type: 'stop-owned-child'});
    assert.equal((await response).type, 'child-exited'); receipt.checks.ownedRuntimeExitedBeforeDriverCrash = true;
    const exit = once(child, 'exit'); child.kill('SIGKILL');
    const [, signal] = await exit; assert.equal(signal, 'SIGKILL'); receipt.checks.driverKilledWithoutCleanup = true;
    assert.equal(processAbsent(child.pid), true); assert.equal(processAbsent(ready.childPID), true);
    const owner = JSON.parse(fs.readFileSync(path.join(ready.work, '.bridge-runtime.json'), 'utf8'));
    assert.equal(owner.phase, 'running'); receipt.checks.absentPIDsWithUnclosedOwnership = true;
    const cli = fileURLToPath(new URL('../bin/bridge.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, 'recover-prepared', directory], {env, encoding: 'utf8', timeout: 60000});
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout); assert.equal(report.complete, true); assert.equal(report.results[0].cleared, 1);
    assert.equal(fs.existsSync(ready.work), false); receipt.checks.recoveryCompleted = true;
    runtime = await startOpenCode(config, env);
    await assert.rejects(runtime.backend.call('/api/session/' + ready.owned), error => error.upstreamStatus === 404);
    assert.equal((await runtime.backend.call('/api/session/' + ready.sentinel)).data.id, ready.sentinel);
    receipt.checks.lateCommittedSessionRemoved = true; receipt.checks.unrelatedSessionPreserved = true;
    await runtime.backend.call('/api/session/' + ready.sentinel, {method: 'DELETE'});
    await runtime.stop(); runtime = null;
    removePreparedDirectory(directory); receipt.checks.preparationRemovable = !fs.existsSync(directory);
    receipt.passed = true;
  } catch { receipt.passed = false; receipt.error = 'crash_recovery_probe_failed'; process.exitCode = 1; }
  finally {
    // On a failed probe do not discard forensic state while a child might remain.
    if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGTERM');
    if (!receipt.passed && !runtime && config && ready && processAbsent(ready.childPID)) try { runtime = await startOpenCode(config, env); } catch {}
    if (runtime) {
      for (const id of [ready?.owned, ready?.sentinel].filter(Boolean)) await runtime.backend.call('/api/session/' + id, {method: 'DELETE'}).catch(() => {});
      await runtime.stop();
    }
    if (receipt.passed) fs.rmSync(root, {recursive: true, force: true});
    else receipt.temporaryStateRetained = true;
    const output = process.env.BRIDGE_RECEIPT || 'generated/crash-recovery-probe.json';
    fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
  }
}

if (process.argv.includes('--worker')) await worker(process.argv[process.argv.indexOf('--worker') + 1]);
else await main();
