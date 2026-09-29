import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SessionJournal} from '../src/session-journal.mjs';
import {RuntimeOwnership} from '../src/runtime-ownership.mjs';
import {recoverSessions} from '../src/recovery.mjs';

function fixture(t) {
  const state = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-recovery-')));
  t.after(() => fs.rmSync(state, {recursive: true, force: true}));
  const directory = fs.mkdtempSync(path.join(state, 'work-old-'));
  const journal = new SessionJournal(directory), owner = new RuntimeOwnership(directory, journal.runID);
  owner.started(987654321); owner.stopped();
  const id = 'ses_' + 'a'.repeat(32), unrelated = 'ses_' + 'b'.repeat(32);
  journal.begin(id);
  const sessions = new Map([[id, {id, location: {directory}}], [unrelated, {id: unrelated, location: {directory}}]]);
  const calls = [];
  const backend = {
    directory: fs.mkdtempSync(path.join(state, 'work-current-')),
    health: async () => ({version: '2.0.18'}),
    call: async (route, options = {}) => {
      const sessionID = route.split('/').at(-1);
      calls.push({id: sessionID, method: options.method || 'GET'});
      if (options.method === 'DELETE') { sessions.delete(sessionID); return null; }
      if (sessions.has(sessionID)) return {data: sessions.get(sessionID)};
      const error = new Error('Not found'); error.code = 'opencode_http_error'; error.upstreamStatus = 404; throw error;
    },
  };
  return {state, directory, journal, owner, id, unrelated, sessions, calls, backend,
    recover: (options = {absent: () => true}) => recoverSessions(state, backend, options)};
}

test('Recovery deletes only the journaled session with matching directory and preserves unrelated sessions', async t => {
  const f = fixture(t);
  const result = await f.recover();
  assert.equal(result.complete, true);
  assert.equal(result.results[0].cleared, 1);
  assert.deepEqual(f.calls.map(x => x.method), ['GET', 'DELETE', 'GET']);
  assert.ok(f.calls.every(x => x.id === f.id));
  assert.ok(f.sessions.has(f.unrelated));
  assert.equal(fs.existsSync(f.directory), false);
  assert.equal(fs.existsSync(f.backend.directory), true);
});
test('An already absent session clears its intent without deletion or generation', async t => {
  const f = fixture(t); f.sessions.delete(f.id);
  assert.equal((await f.recover()).complete, true);
  assert.deepEqual(f.calls, [{id: f.id, method: 'GET'}]);
});
test('A possibly live parent or child and a reused PID block all session access', async t => {
  for (const phase of ['running', 'stopped']) {
    const f = fixture(t); f.owner.record.phase = phase; f.owner.write();
    const result = await f.recover({absent: () => false});
    assert.equal(result.results[0].reason, 'owner_may_be_alive');
    assert.deepEqual(f.calls, []);
    assert.equal(f.journal.hasPending(), true);
  }
  const f = fixture(t); f.owner.record.phase = 'running'; f.owner.write();
  assert.equal((await f.recover({absent: pid => pid !== process.pid})).complete, false);
  assert.deepEqual(f.calls, []);
});
test('Session identity and location mismatches never cause deletion', async t => {
  for (const mutation of ['id', 'location']) {
    const f = fixture(t);
    f.sessions.set(f.id, mutation === 'id' ? {id: f.unrelated, location: {directory: f.directory}} : {id: f.id, location: {directory: f.state}});
    const result = await f.recover();
    assert.equal(result.results[0].reason, 'session_ownership_mismatch');
    assert.deepEqual(f.calls, [{id: f.id, method: 'GET'}]);
    assert.equal(f.journal.hasPending(), true);
  }
});
test('Legacy, unrelated and symlinked records and recovery locks remain untouched', async t => {
  for (const mutation of ['legacy', 'runID', 'symlink', 'lock']) {
    const f = fixture(t), file = f.journal.file(f.id), bytes = fs.readFileSync(file, 'utf8');
    if (mutation === 'symlink') {
      const outside = path.join(f.state, 'outside.json'); fs.writeFileSync(outside, bytes); fs.unlinkSync(file); fs.symlinkSync(outside, file);
    } else if (mutation === 'lock') fs.writeFileSync(path.join(f.directory, '.bridge-recovery.lock'), 'existing-owner');
    else { const value = JSON.parse(bytes); if (mutation === 'legacy') value.version = 1; else value.runID = 'wrong'; fs.writeFileSync(file, JSON.stringify(value)); }
    assert.equal((await f.recover()).complete, false);
    assert.deepEqual(f.calls, []);
    assert.ok(fs.existsSync(file));
    if (mutation === 'lock') assert.equal(fs.readFileSync(path.join(f.directory, '.bridge-recovery.lock'), 'utf8'), 'existing-owner');
  }
});
test('Unknown user files are preserved even when owned session cleanup succeeds', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.directory, 'keep-me.txt'), 'user-data');
  const result = await f.recover();
  assert.equal(result.results[0].status, 'state_retained');
  assert.equal(f.journal.hasPending(), false);
  assert.equal(fs.readFileSync(path.join(f.directory, 'keep-me.txt'), 'utf8'), 'user-data');
});
test('Unconfirmed deletion retains the recovery intent', async t => {
  const f = fixture(t), original = f.backend.call;
  f.backend.call = (route, options) => options?.method === 'DELETE' ? Promise.resolve(null) : original(route, options);
  assert.equal((await f.recover()).results[0].reason, 'deletion_not_confirmed');
  assert.equal(f.journal.hasPending(), true);
});
