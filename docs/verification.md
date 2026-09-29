# Verification and model support — 0.2.0-rc.1

This candidate is private and experimental. Passing the adapter tests does not
certify every model, every Desktop tool, or future provider availability.

## Current support matrix

| Model / route | Actual evidence | Status |
|---|---|---|
| `opencode/space-bunny-free`, native tools, direct dispatch | Complete real Codex app-server suite: create, follow-up, repair, denied approval, cancellation, timeout and recovery | Verified for this text/tool test scope |
| `opencode/nemotron-3-ultra-free`, direct dispatch | File/command workflows and individual repairs succeeded; repeated complete suites failed on internal-tool choices or generation failure | Experimental; not a verified full workflow |
| Nemotron, Code Mode dispatch | File repair reached an independently passing test, but the turn exceeded its 180-second limit | Experimental; failed terminal completion gate |
| Other OpenCode models | Configurable allowlist, no acceptance receipt | Unverified |
| Images/audio/files, hosted search, adjustable reasoning | Rejected rather than silently dropped | Unsupported |

Space Bunny is a useful control because its direct external API was already an
option; success here validates the bridge's client-tool protocol, not a claim that
this model requires a runtime bridge. Nemotron's failure is the primary remaining
limitation for the original free-model use case. The project does not promise
unlimited access or reinterpret a provider rejection as permission to bypass it.

## Real client method

`node scripts/native-acceptance.mjs --live` starts the installed official OpenCode
runtime, an isolated bridge, and a real Codex app-server with ephemeral threads.
It uses fresh markers and temporary files, checks generated files independently,
re-runs the repaired test, refuses approvals, interrupts a live turn, injects a
short deadline, and verifies a subsequent turn completes. Tool actions run in the
Codex workspace. OpenCode's own workspace tools remain blocked.

Use `BRIDGE_TEST_MODEL=opencode/space-bunny-free` for the verified control.
`BRIDGE_TOOL_TRANSPORT=codemode` opts into the experimental dispatcher.
OpenCode 2.0.18 / Codex 0.157.1 / Node 24.4.1 / macOS were exercised live.
The 32k catalog value is an acceptance-test budget, not the provider's maximum.

## Receipts and negative evidence

Sanitized receipts are under [receipts/](receipts/). They contain model/runtime
versions, checks, timing and failure messages, not keys, prompts, raw tool output
or personal workspace paths. Later receipts include a source digest. Early
receipts do not identify every intermediate uncommitted revision; they are
exploratory history, not an exact release-build certificate.

- [Space Bunny release-candidate suite with source digest](receipts/space-bunny-rc-suite.json).
- [Space Bunny first complete suite](receipts/space-bunny-first-suite.json).
- [Nemotron initial suite](receipts/nemotron-initial-suite.json).
- [Nemotron corrective suite](receipts/nemotron-corrective-suite.json).
- [Nemotron native-history repair failure](receipts/nemotron-native-history-repair.json).
- [Nemotron Code Mode repair timeout](receipts/nemotron-codemode-repair.json).
- [Isolated Router protocol rehearsal](receipts/router-rehearsal.json).

Different revisions and prompts must not be pooled into a model benchmark or a
claimed production success rate. The original plain-text v0.1 smoke and first
native feasibility probes remain described in [development history](native-tool-progress.md).

## Offline and integration checks

`npm run check` and `npm test` cover authentication, SSE/event identities,
cancellation/cleanup, schema validation, native message history, runtime guards,
bounded corrective retry and reversible preparation. CI runs on macOS/Linux and
Node 22/24; live model tests are deliberately not part of CI.

The optional `scripts/router-rehearsal.mjs --router-root /installed/codex-router`
uses generated credentials and a mock upstream through the actual Router,
LiteLLM gateway and API forwarder. It confirms original native catalog entries
remain intact, upstream model mapping, namespace/call identity, reasoning fields,
and removal of temporary state. It does not execute a Desktop GUI turn or prove
that a live menu has been migrated.

## Hidden internal tools follow-up

The bridge now offers opt-in `BRIDGE_INTERNAL_TOOLS=hidden`. The actual outgoing
HTTP tool list was checked in a guarded/hidden/guarded comparison. Nemotron
returned 200/403/200; Space Bunny returned 200/200/200 with correct client calls.
Space Bunny also passed two consecutive complete hidden-tool Codex suites. A prior development
run had a follow-up failure; reliability remains under investigation.
See [implementation and evidence](tool-surface.md). This replaces the earlier
assumption that removing the internal surface requires an upstream API change:
the official plugin API can remove it, but model access restrictions remain.

## Release decision and concrete options

The candidate can be reviewed as an experimental native-tool bridge with a
verified control model. It is **not ready to advertise Nemotron as equivalent to
native GPT integration**. For that narrower requirement, the concrete options are:

1. Keep Nemotron experimental and use the verified Space Bunny path for client
   workflows now; direct API access may be simpler for that particular model.
2. Validate another officially available model or route that reliably accepts
   arbitrary client tool schemas; publish its own receipt before enabling it.
3. Use the official plugin-based hidden-tool mode where permitted, and seek
   upstream clarification of the reproducible Nemotron rejection. Do not spoof
   identity or bypass access checks to obtain it.

No public release, account sharing, live-router restart or active Desktop-model
migration is included in this candidate.
