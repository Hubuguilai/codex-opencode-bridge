import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {SessionJournal} from '../src/session-journal.mjs';
import {OpenCodeBackend} from '../src/opencode.mjs';

function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-journal-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}
function fixture(t, failure) {
  const root = directory(t), journal = new SessionJournal(root), warnings = [];
  const backend = new OpenCodeBackend({url: 'http://unused.invalid', password: 'never-store-password', directory: root, journal, warn: code => warnings.push(code)});
  let id;
  backend.call = async (route, options = {}) => {
    if (route === '/api/session') {
      id = options.body.id;
      const bytes = fs.readFileSync(journal.file(id), 'utf8');
      assert.equal(JSON.parse(bytes).sessionID, id);
      assert.equal(JSON.parse(bytes).directory, root);
      assert.doesNotMatch(bytes, /never-store|private-prompt/);
      assert.equal(fs.statSync(journal.file(id)).mode & 0o777, 0o600);
      if (failure === 'create') throw new Error('Lost creation reply');
      return {data: {id}};
    }
    if (options.method === 'DELETE' && failure === 'delete') throw new Error('Runtime unavailable');
    if (route.includes('/message?')) return {data: [{type: 'assistant', content: [{type: 'text', text: 'done'}], time: {completed: 1}, finish: 'stop'}]};
    return null;
  };
  const generate = () => backend.generate({model: 'opencode/test', prompt: 'private-prompt'}, {signal: AbortSignal.timeout(2000), onDelta: () => {}});
  return {journal, backend, warnings, generate};
}

test('Session intent exists before create and is removed after confirmed creation and deletion', async t => {
  const {journal, generate} = fixture(t);
  await generate();
  assert.equal(journal.hasPending(), false);
});
test('Failed cleanup and ambiguous creation retain exact recovery identities', async t => {
  for (const failure of ['create', 'delete']) {
    const {journal, generate, warnings} = fixture(t, failure);
    if (failure === 'create') await assert.rejects(generate(), /Lost creation/);
    else await generate();
    assert.equal(journal.hasPending(), true);
    assert.equal(fs.readdirSync(journal.root).length, 1);
    assert.deepEqual(warnings, [failure === 'create' ? 'session_recovery_pending' : 'session_cleanup_failed']);
  }
});
test('Journal write failure prevents any upstream call', async t => {
  const {journal, backend, generate} = fixture(t);
  fs.rmSync(journal.root, {recursive: true});
  let calls = 0;
  backend.call = async () => { calls++; };
  await assert.rejects(generate());
  assert.equal(calls, 0);
  assert.equal(backend.busy, false);
});
test('A process killed during creation leaves a readable session intent without prompt or credentials', {timeout: 10000}, async t => {
  const root = directory(t);
  const source = `
    import {SessionJournal} from ${JSON.stringify(new URL('../src/session-journal.mjs', import.meta.url).href)};
    import {OpenCodeBackend} from ${JSON.stringify(new URL('../src/opencode.mjs', import.meta.url).href)};
    const journal = new SessionJournal(${JSON.stringify(root)});
    const backend = new OpenCodeBackend({url:'http://unused.invalid', password:'secret-password', directory:${JSON.stringify(root)}, journal});
    backend.call = async (route, options) => {
      if (route === '/api/session') {
        process.stdout.write(options.body.id + '\\n');
        await new Promise(() => { setInterval(() => {}, 1000); });
      }
    };
    await backend.generate({model:'opencode/test', prompt:'secret-prompt'}, {signal:new AbortController().signal, onDelta:()=>{}});
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const [bytes] = await once(child.stdout, 'data');
  const id = bytes.toString().trim();
  const exit = once(child, 'exit');
  child.kill('SIGKILL');
  const [, signal] = await exit;
  assert.equal(signal, 'SIGKILL');
  assert.match(id, /^ses_[a-f0-9]{32}$/);
  const persisted = fs.readFileSync(path.join(root, '.bridge-sessions', `${id}.json`), 'utf8');
  assert.equal(JSON.parse(persisted).sessionID, id);
  assert.doesNotMatch(persisted, /secret-password|secret-prompt/);
});
