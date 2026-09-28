# Verification — 2026-09-28

## Local checks

- Node.js 24.4.1 on macOS.
- `npm run check`: passed.
- `npm test`: **18 passed, 0 failed**.
- No runtime npm dependencies. Package-lock generated; initial npm audit: 0 findings.
- Pre-push sensitive-pattern scan: no API-key patterns, GitHub tokens, private-key
  blocks or the operator's absolute home path in project files.

Tests exercise HTTP authentication, Unicode, message history, both output formats,
incremental SSE, error redaction, input overflow, unsupported features, upstream
readiness, cancellation, timeouts, concurrency, non-append output, HTTP 204 cleanup
and cancellation during session creation. They use a local mock OpenCode server.

## Real runtime requests

`npm run smoke -- --live` with an explicitly selected installed OpenCode binary:

```json
{
  "model": "opencode/nemotron-3-ultra-free",
  "upstream": { "version": "2.0.18" },
  "results": [
    { "api": "chat/completions", "status": 200, "markerReceived": true, "ok": true },
    { "api": "responses", "status": 200, "markerReceived": true, "ok": true }
  ]
}
```

The Chat request returned a normal JSON completion; the Responses request emitted
the expected completion event with the test marker. This proves one short text
request on each interface, not full context capacity, tool use, sustained load,
every model, or Desktop picker integration. Upstream availability can change.

A separate marker request to the operator's pre-existing prototype also succeeded.
No active Codex Router provider or LaunchAgent was replaced by this project.

## Findings from failed probes

1. A version with all internal permissions denied returned an upstream free-tier
   403. Removing that override while still using custom UUID session IDs also failed.
   Using OpenCode-generated session IDs and the default Plan permissions succeeded.
   This is an observed compatibility boundary; **the separate causal contribution
   of permissions versus ID shape was not isolated**. We use the official session
   defaults, and do not claim the model is accessible with tools completely disabled.
2. Session deletion returns HTTP 204 without JSON. The adapter now accepts this as
   success; a dedicated regression test covers it.
3. Readiness must validate JSON and version, not HTTP 200, since unsupported routes
   can return the OpenCode HTML application.

## Remaining verification

- GitHub matrix results are visible in the repository's Actions tab.
- No full Codex native tool round trip was attempted or implemented.
- No long-context, multimodal, Windows, or other model result is claimed.
- Unexpected upstream tools cause an error, but detection is not an execution sandbox.
