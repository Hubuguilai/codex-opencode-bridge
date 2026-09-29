# Native session identity regression

On 2026-09-29, provider HTTP 403 was traced to the bridge's preallocated session identities. The session recovery change had used `ses_` plus 32 UUID hex characters. OpenCode v2 accepts that input locally, but its own generated identities use a 26-character body: 12 descending time/counter hex characters followed by 14 base62 characters.

Controlled Big Pickle results on the same installed official OpenCode 2.0.18 runtime and existing access environment:

| Path | Result |
| --- | --- |
| Native bridge, UUID-derived ID | HTTP 403, provider.auth |
| Official Build session API, no bridge plugin, UUID-derived ID, tools approval-gated | Same HTTP 403 |
| Official standalone CLI Build, no bridge | Control reply succeeds |
| Same official Build session API, server-generated ID | Control reply succeeds |

The raw provider message was: “Error from provider (Console): OpenCode's free tier can only be used from within OpenCode”. It did not say the quota was exhausted. These controls isolate a session-identity interoperability regression; they do not establish every detail of the provider's private validation logic. The earlier blanket upstream-access diagnosis was incomplete.

The bridge now preallocates native-format session IDs, preserving write-ahead intent recording before session creation. Journal and recovery validation accept both native IDs and legacy UUID IDs, so old recovery records remain usable. It does not change the client binary, user agent, account, provider credentials, tool guards, or entitlement.

Reference: official [SessionID](https://github.com/anomalyco/opencode/blob/516cfe4e09f1ac42f3867b436b7051f60f05cb2d/packages/schema/src/session-id.ts) and [identifier format](https://github.com/anomalyco/opencode/blob/516cfe4e09f1ac42f3867b436b7051f60f05cb2d/packages/schema/src/identifier.ts). Diagnostic receipts are in [receipts/session-id-diagnosis](receipts/session-id-diagnosis/). Raw private debug logs are not committed.

## Post-fix results

All four current full-suite attempts used identical runtime source and had no HTTP 403: Big Pickle 10/10; MiMo V2.6 Flash Free 10/10; LongCat 2.5 Preview Free 9/10 (patch-update exact contents failed); Nemotron 3 Ultra Free 9/10 (repair generation failed). The matrix remains failed because these remaining failures are not waived. Bunny was not rerun in this cohort; its prior 9/10 result remains revision-specific. See [full receipts](receipts/native-id-four-models/matrix.json).

87 offline tests, syntax checks, isolated package installation checks, and a real-runtime delayed-create/crash/recovery probe passed. Desktop activation remains unapplied.
