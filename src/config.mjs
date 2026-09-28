import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export function stateDirectory(env = process.env) {
  return path.resolve(env.BRIDGE_STATE_DIR || path.join(os.homedir(), '.local/share/codex-opencode-bridge-project'));
}

export function readConfig(env = process.env) {
  const stateDir = stateDirectory(env);
  const mode = env.BRIDGE_MODE || 'text';
  if (!['text', 'native-tools'].includes(mode)) throw new Error('BRIDGE_MODE must be text or native-tools.');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const tokenPath = path.join(stateDir, 'local-token');
  let token = env.BRIDGE_TOKEN;
  if (!token) {
    try { fs.writeFileSync(tokenPath, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    token = fs.readFileSync(tokenPath, 'utf8').trim();
  }
  if (token.length < 24 || /\s/.test(token)) throw new Error('Bridge token must contain at least 24 non-whitespace characters.');
  const number = (name, fallback, max) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}.`);
    return value;
  };
  const port = number('BRIDGE_PORT', 4396, 65535);
  const upstreamPort = number('OPENCODE_PORT', 4397, 65535);
  if (port === upstreamPort) throw new Error('Bridge and OpenCode ports must differ.');
  const models = [...new Set((env.BRIDGE_MODELS || 'opencode/nemotron-3-ultra-free').split(',').map(x => x.trim()))];
  if (models.some(x => !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(x))) {
    throw new Error('BRIDGE_MODELS must be comma-separated provider/model IDs.');
  }
  return {
    host: '127.0.0.1', port, upstreamPort, stateDir, tokenPath, token, models, mode,
    timeoutMs: number('BRIDGE_TIMEOUT_MS', 180000, 3600000),
    pollMs: number('BRIDGE_POLL_MS', 250, 10000),
    maxBodyBytes: number('BRIDGE_MAX_BODY_BYTES', 16000000, 100000000),
    maxOutputBytes: number('BRIDGE_MAX_OUTPUT_BYTES', 8000000, 100000000),
    maxConcurrent: mode === 'native-tools' ? 1 : number('BRIDGE_MAX_CONCURRENT', 2, 32),
  };
}

export function findOpenCode(env = process.env) {
  const executable = file => {
    try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
  };
  if (env.OPENCODE_BIN) {
    const file = path.resolve(env.OPENCODE_BIN);
    if (!executable(file)) throw new Error('OPENCODE_BIN is not an executable file.');
    return file;
  }
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    const file = path.join(dir, 'opencode');
    if (executable(file)) return file;
  }
  const common = path.join(os.homedir(), '.opencode/bin/opencode');
  if (executable(common)) return common;
  throw new Error('OpenCode not found. Install OpenCode v2 or set OPENCODE_BIN to its executable.');
}
