# Native text streaming

Native `stream:true` requests subscribe to the official OpenCode v2 `/api/event`
endpoint before submitting the prompt. Only `session.text.started`,
`session.text.delta` and `session.text.ended` events for that request's session
are forwarded. Reasoning events and other sessions' text are not forwarded.

OpenCode 2.0.18's message-query snapshots contain completed text parts; the live
fragments are separate. Polling those snapshots alone produced a single text
chunk in both protocols. The bridge now uses live events for delivery and polls
chronological snapshots (`order=asc`) for completion and reconciliation.

## Integrity and lifecycle

- Verify a matching text start before accepting deltas, with message/part identity.
- Preserve text preceding a client tool call. Text and function calls use distinct
  Responses output indices and stable identities.
- Reconcile final message text without replaying already delivered prefixes. A
  rewritten or removed prefix fails explicitly.
- Apply the configured output-byte limit across all assistant dispatch steps.
- Await downstream backpressure. Explicitly cancel the event reader before
  interrupting/deleting the session or finishing a response.
- Never reconnect a broken volatile stream or retry after displaying partial
  text. The response fails instead of assuming no text was lost.

This is incremental **visible text** streaming. Tool argument deltas are still
sent after a complete structured call is captured. This does not claim streaming
reasoning, multimodal parity or every provider-specific event format.

## Live evidence

The same managed OpenCode process handles the Responses request followed by the
Chat Completions request. The probe requires multiple nonempty deltas at distinct
times, successful termination, and exact final-text reconciliation for Responses.
No generated content, prompts or credentials are persisted in receipts.

- [Snapshot-only negative control](receipts/native-stream-snapshot-probe.json):
  one chunk per protocol; neither passed the incremental-stream gate.
- [First event-stream attempt](receipts/native-stream-first-events-probe.json):
  Responses delivered 14 chunks; the subsequent request timed out. Diagnostic
  reproduction stalled during event-reader shutdown.
- [Explicit reader cancellation](receipts/native-stream-reader-probe.json):
  Responses delivered 16 chunks over 7.211 seconds and Chat delivered 7 chunks
  over 2.721 seconds. Both requests completed in the same managed process.

- [Final chronological-snapshot revision](receipts/native-stream-final-probe.json):
  Responses delivered 9 chunks over 1.070 seconds; Chat delivered 16 chunks over
  6.501 seconds. Both completed with the same source digest as the complete Codex
  workflow regression below.

Receipts identify the source digest of each development revision; they must not
be interpreted as measurements of another revision or as latency benchmarks.
Provider generation time and load vary between requests.

```sh
node scripts/native-stream-probe.mjs --live
BRIDGE_TEST_MODEL=opencode/space-bunny-free BRIDGE_INTERNAL_TOOLS=hidden \
  node scripts/native-acceptance.mjs --live
```

The streaming probe uses isolated ports 4896/4897 and removes its runtime state.
It does not modify Desktop model entries or the active router.

Official references: [OpenCode v2 event API](https://opencode.ai/v2/docs/api#event),
[OpenCode session specification](https://github.com/anomalyco/opencode/blob/dev/specs/v2/session.md).
The installed `@opencode/client` and `@opencode/schema` 2.0.18 declarations were
also inspected for event shapes. These packages are not runtime dependencies.

## Native Codex workflow regression

The final chronological-snapshot implementation passed a complete real Codex
app-server suite with Space Bunny and hidden internal tools: creation (3 commands),
same-thread follow-up (4), Python repair (6 plus native file change), approval
denial (1), cancellation, timeout and recovery. The independent repair check
passed with the test source unchanged. See the [source-matched receipt](receipts/space-bunny-streaming-suite.json).

Offline coverage includes cumulative snapshots, dispatch continuations, mixed
text/tool output indices, session filtering, CRLF SSE chunks, dropped connections,
missing text starts, non-append text, output byte limits and cancellation.

## Nemotron regression boundary

The Code Mode repair task was repeated after chronological snapshots and live
streaming were implemented. It executed two real Codex commands, then failed
because the model chose a blocked OpenCode internal tool. The independent repair
check did not pass. See the [negative receipt](receipts/nemotron-streaming-repair.json).
The ordering fix does not establish reliable Nemotron workflow compatibility,
and this run does not demonstrate that the previous timeout had a single cause.
