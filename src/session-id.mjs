import {randomInt} from 'node:crypto';

// OpenCode v2 SessionID.create contract: descending 48-bit time/counter,
// then 14 base62 characters. Keep native identities when preallocating recovery.
// Reference: anomalyco/opencode packages/schema/src/{session-id,identifier}.ts.
let lastTimestamp = -1;
let counter = 0;
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function createSessionID() {
  const timestamp = Date.now();
  if (timestamp !== lastTimestamp) { lastTimestamp = timestamp; counter = 0; }
  counter++;
  const value = (~(BigInt(timestamp) * 4096n + BigInt(counter))) & ((1n << 48n) - 1n);
  let suffix = '';
  for (let i = 0; i < 14; i++) suffix += alphabet[randomInt(62)];
  return 'ses_' + value.toString(16).padStart(12, '0') + suffix;
}
// Legacy UUID identities must remain recoverable, but are never newly generated.
export function isJournalSessionID(id) {
  return typeof id === 'string' && /^ses_(?:[a-f0-9]{12}[A-Za-z0-9]{14}|[a-f0-9]{32})$/.test(id);
}
