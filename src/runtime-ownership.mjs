import fs from 'node:fs';
import path from 'node:path';

export function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

export class RuntimeOwnership {
  constructor(directory, runID) {
    this.directory = fs.realpathSync(directory);
    this.file = path.join(directory, '.bridge-runtime.json');
    this.record = {version: 1, directory: this.directory, runID, parentPID: process.pid, childPID: null, phase: 'starting'};
    this.write();
  }
  write() {
    const temporary = this.file + '.tmp';
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.record) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, this.file);
    syncDirectory(this.directory);
  }
  started(pid) { this.record.childPID = pid; this.record.phase = 'running'; this.write(); }
  stopped() { this.record.phase = 'stopped'; this.write(); }
}

export function processAbsent(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}
