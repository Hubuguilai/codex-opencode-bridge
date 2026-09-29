import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionID,isJournalSessionID} from '../src/session-id.mjs';

test('Preallocated session identity follows native descending timestamp contract', () => {
 const before = Date.now();
 const ids = Array.from({length: 1000}, () => createSessionID());
 const after = Date.now();
 assert.equal(new Set(ids).size, ids.length);
 for (const id of ids) {
  assert.match(id, /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  const stamp = Number(((~BigInt('0x'+id.slice(4,16))) & ((1n<<48n)-1n)) / 4096n);
  assert.ok(stamp >= before % 2**36 && stamp <= after % 2**36);
  assert.ok(isJournalSessionID(id));
 }
});
test('Recovery keeps legacy identities and rejects unsafe or malformed names', () => {
 assert.ok(isJournalSessionID('ses_'+'a'.repeat(32)));
 for (const id of [null, '../ses_'+'a'.repeat(32), 'ses_'+'a'.repeat(25), 'ses_'+'a'.repeat(27), 'ses_'+'a'.repeat(26)+'.json']) assert.equal(isJournalSessionID(id), false);
});
