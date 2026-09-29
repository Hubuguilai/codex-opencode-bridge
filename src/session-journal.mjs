import fs from 'node:fs';
import path from 'node:path';

function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// Intents contain identifiers only, never prompts, model output or credentials.
// Recovery must verify ownership against the runtime before acting on them.
export class SessionJournal {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.root = path.join(this.directory, '.bridge-sessions');
    fs.mkdirSync(this.root, {mode: 0o700});
    syncDirectory(this.directory);
  }
  file(id) {
    if (!/^ses_[a-f0-9]{32}$/.test(id)) throw new Error('Invalid journal session identity.');
    return path.join(this.root, `${id}.json`);
  }
  begin(id) {
    const fd = fs.openSync(this.file(id), 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({version: 1, sessionID: id, directory: this.directory, createdAt: new Date().toISOString()}) + '\n');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    syncDirectory(this.root);
  }
  complete(id) {
    fs.unlinkSync(this.file(id));
    syncDirectory(this.root);
  }
  hasPending() { return fs.readdirSync(this.root).length !== 0; }
}
