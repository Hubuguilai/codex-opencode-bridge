import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/bridge.mjs', import.meta.url));
const models = ['opencode/space-bunny-free', 'opencode/big-pickle'];
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-cli-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: {...process.env, BRIDGE_STATE_DIR: path.join(root, 'unexpected-state'), OPENCODE_BIN: '/nonexistent/cli-test-runtime'},
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return result;
  };
  return {root, run};
}

test('CLI rejects incomplete, misspelled, duplicate and extra arguments before writing', t => {
  const {root, run} = fixture(t);
  for (const args of [
    ['prepare', 'new', '--modles', models[0]],
    ['prepare', 'new', '--models'],
    ['prepare', 'new', '--models', '--catalog', 'source.json'],
    ['prepare', 'new', '--model', models[0], '--model', models[1]],
    ['prepare', 'new', '--models='],
    ['prepare', 'new', 'unexpected'],
    ['prepare', '--models', models.join(',')],
    ['prepare-router', 'new', '--prepared', 'source'],
    ['serve', '--unknown'], ['init', '--unknown'], ['init', 'unexpected'],
    ['serve-prepared'], ['remove-prepared'], ['recover-prepared'], ['recover-prepared', 'new', '--force'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.notEqual(result.stderr.trim(), '');
    assert.deepEqual(fs.readdirSync(root), [], JSON.stringify(args));
  }
});

test('CLI preserves a preparation on unsupported dry-run and removes only on valid invocation', t => {
  const {root, run} = fixture(t);
  const directory = 'prepared models';
  const created = run(['prepare', directory, '--models', models.join(','), '--model', models[1]]);
  assert.equal(created.status, 0, created.stderr);
  assert.deepEqual(JSON.parse(created.stdout).models, models);
  const target = path.join(root, directory);
  const snapshot = fs.readdirSync(target).filter(name => name !== 'state').map(name => [name, fs.readFileSync(path.join(target, name))]);
  const token = fs.readFileSync(path.join(target, 'state/local-token'));
  const denied = run(['remove-prepared', directory, '--dry-run']);
  assert.equal(denied.status, 1);
  for (const [name, bytes] of snapshot) assert.deepEqual(fs.readFileSync(path.join(target, name)), bytes);
  assert.deepEqual(fs.readFileSync(path.join(target, 'state/local-token')), token);
  const removed = run(['remove-prepared', '--', directory]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.deepEqual(JSON.parse(removed.stdout), {removed: true});
  assert.deepEqual(fs.readdirSync(root), []);
});

test('CLI accepts equals syntax and options before a directory without changing the model selection', t => {
  const {root, run} = fixture(t);
  const result = run(['prepare', `--models=${models.join(',')}`, '--model', models[1], 'prepared models']);
  assert.equal(result.status, 0, result.stderr);
  const prepared = JSON.parse(result.stdout);
  assert.deepEqual(prepared.models, models);
  assert.equal(prepared.model, models[1]);
  assert.equal(prepared.directory, path.join(fs.realpathSync(root), 'prepared models'));
});

test('CLI command help never initializes configuration or launches a runtime', t => {
  const {root, run} = fixture(t);
  for (const command of ['prepare', 'prepare-router', 'serve-prepared', 'remove-prepared', 'recover-prepared', 'serve', 'init']) {
    const result = run([command, '--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Commands:/);
    assert.deepEqual(fs.readdirSync(root), []);
  }
});
