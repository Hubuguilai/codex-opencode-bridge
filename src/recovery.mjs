import fs from 'node:fs';
import path from 'node:path';
import {processAbsent, syncDirectory} from './runtime-ownership.mjs';

function readJSON(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('invalid_record');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function checkOwnership(directory, absent) {
  const owner = readJSON(path.join(directory, '.bridge-runtime.json'));
  if (owner.version !== 1 || owner.directory !== directory || !/^[a-f0-9-]{36}$/.test(owner.runID)
      || !['running', 'stopped'].includes(owner.phase) || !Number.isSafeInteger(owner.childPID)
      || owner.childPID < 1 || !Number.isSafeInteger(owner.parentPID) || owner.parentPID < 1) throw new Error('unverified_owner');
  // PID reuse deliberately blocks recovery rather than risking a live runtime.
  if (!absent(owner.childPID) || (owner.phase !== 'stopped' && !absent(owner.parentPID))) throw new Error('owner_may_be_alive');
  return owner;
}
const generatedFiles = new Set([
  '.bridge-runtime.json', '.bridge-recovery.lock', 'opencode.json',
  'bridge-request.json', 'bridge-call.json', 'bridge-plugin-ready',
  '.opencode/plugins/codex-relay/index.js',
]);
const generatedDirectories = new Set(['.bridge-sessions', '.opencode', '.opencode/plugins', '.opencode/plugins/codex-relay']);
function onlyGeneratedFiles(root, relative = '') {
  for (const name of fs.readdirSync(path.join(root, relative))) {
    const child = relative ? `${relative}/${name}` : name;
    const stat = fs.lstatSync(path.join(root, child));
    if (stat.isSymbolicLink()) return false;
    if (stat.isDirectory()) {
      if (!generatedDirectories.has(child) || !onlyGeneratedFiles(root, child)) return false;
    } else if (!stat.isFile() || !generatedFiles.has(child)) return false;
  }
  return true;
}
async function getSession(backend, id) {
  try { return await backend.call(`/api/session/${id}`); }
  catch (error) {
    if (error.code === 'opencode_http_error' && error.upstreamStatus === 404) return null;
    throw error;
  }
}

// Use only a freshly managed runtime, never a caller-supplied remote endpoint.
// Old-format journals and unknown files are retained for manual inspection.
export async function recoverSessions(stateDir, backend, {absent = processAbsent} = {}) {
  const state = fs.realpathSync(stateDir), current = fs.realpathSync(backend.directory), results = [];
  if (path.dirname(current) !== state) throw new Error('Recovery runtime must belong to the selected state directory.');
  await backend.health();
  for (const name of fs.readdirSync(state).filter(name => name.startsWith('work-')).sort()) {
    const directory = path.join(state, name);
    if (directory === current) continue;
    const result = {directory: name, status: 'blocked', cleared: 0};
    results.push(result);
    let locked = false;
    const lock = path.join(directory, '.bridge-recovery.lock');
    try {
      const stat = fs.lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('invalid_work_directory');
      let owner = checkOwnership(directory, absent);
      const fd = fs.openSync(lock, 'wx', 0o600);
      locked = true;
      try { fs.writeFileSync(fd, JSON.stringify({pid: process.pid}) + '\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      // Recheck after acquiring the per-directory lock.
      const checked = checkOwnership(directory, absent);
      if (JSON.stringify(checked) !== JSON.stringify(owner)) throw new Error('owner_changed');
      owner = checked;
      const journal = path.join(directory, '.bridge-sessions');
      const journalStat = fs.lstatSync(journal);
      if (!journalStat.isDirectory() || journalStat.isSymbolicLink()) throw new Error('invalid_journal');
      const intents = fs.readdirSync(journal).map(file => {
        if (!/^ses_[a-f0-9]{32}\.json$/.test(file)) throw new Error('invalid_intent');
        const intent = readJSON(path.join(journal, file));
        if (intent.version !== 2 || intent.sessionID + '.json' !== file || intent.directory !== directory || intent.runID !== owner.runID) throw new Error('unverified_intent');
        return {file, intent};
      });
      for (const {file, intent} of intents) {
        const session = await getSession(backend, intent.sessionID);
        if (session !== null) {
          if (session.data?.id !== intent.sessionID || session.data?.location?.directory !== directory) throw new Error('session_ownership_mismatch');
          // No generation is resumed or replayed. Only the exact owned session is removed.
          await backend.call(`/api/session/${intent.sessionID}`, {method: 'DELETE'});
          if (await getSession(backend, intent.sessionID) !== null) throw new Error('deletion_not_confirmed');
        }
        fs.unlinkSync(path.join(journal, file));
        syncDirectory(journal);
        result.cleared++;
      }
      if (!onlyGeneratedFiles(directory)) {
        result.status = 'state_retained'; result.reason = 'unexpected_files';
      } else {
        fs.rmSync(directory, {recursive: true});
        syncDirectory(state);
        result.status = 'recovered';
      }
    } catch (error) {
      const reasons = ['unverified_owner', 'owner_may_be_alive', 'invalid_work_directory', 'owner_changed', 'invalid_journal', 'invalid_intent', 'unverified_intent', 'session_ownership_mismatch', 'deletion_not_confirmed'];
      result.reason = reasons.includes(error.message) ? error.message : error.code === 'EEXIST' ? 'recovery_locked' : 'recovery_failed';
    } finally {
      if (locked) try { fs.unlinkSync(lock); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return {results, complete: results.every(result => result.status === 'recovered')};
}
