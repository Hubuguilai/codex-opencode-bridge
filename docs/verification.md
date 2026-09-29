# Verification and model support — 0.2.0-rc.1

This candidate is private and experimental. Passing the adapter tests does not
certify every model, every Desktop tool, or future provider availability.

## Current support matrix

All new alias suites below used the same runtime source digest
`e0c3f0b79b53bbf2ead5992d2441511b2ccac1c7265021f1036b62e3e9944298`.
Each complete suite has seven gates: creation, same-thread follow-up, repair,
approval denial, cancellation, deadline and recovery. These are small fixtures,
not a production success-rate estimate or full GPT feature parity.

| Exact model / route | Evidence | Current status |
|---|---|---|
| `opencode/nemotron-3-ultra-free`, client aliases | Two consecutive complete suites, plus a focused repair | Passed this text/tool workflow scope |
| `opencode/space-bunny-free`, client aliases | Complete suite; earlier guarded/hidden suites also passed | Passed this text/tool workflow scope |
| `opencode/mimo-v2.6-flash-free`, client aliases | Complete suite and focused repair | Passed this text/tool workflow scope |
| `opencode/longcat-2.5-preview-free`, client aliases | Complete suite and focused repair | Passed this text/tool workflow scope |
| `opencode/big-pickle`, client aliases | Complete suite | Passed this text/tool workflow scope |
| `opencode/nemotron-3.5-lightning-free`, client aliases | Repair reached client calls but timed out without fixing the fixture | Experimental; failed workflow gate |
| `opencode/ling-3.0-flash-fin-free` | Suite failed; separate short diagnostic reported provider HTTP 400, endpoint unavailable | Unavailable in this run |
| `opencode/jev-1.13-free` | Absent from default runtime inventory; explicit temporary registration succeeded, but text generation returned provider HTTP 500 | Not verified; upstream failure |
| `opencode/deepseek-v4-flash-free` | Absent from runtime inventory; repair failed before a client command | Not verified; do not confuse with paid/Go DeepSeek routes |
| `opencode/muse-spark-1.3-contributor-free` | Listed by runtime; no acceptance run | Unverified; eligibility not inferred |
| Images/audio/files, hosted search, adjustable reasoning | Explicitly rejected | Unsupported |

[Client-alias semantics](client-aliases.md) explain why file aliases show command
execution instead of a native patch diff. Original supplied Codex tools remain
available. All actions still execute in Codex under client permissions.

The [initialized runtime inventory](receipts/free-model-runtime-inventory.json)
contained eight free-labelled/zero-cost candidates. It differed from both the
public Zen API list and models.dev. Model listing is not an access guarantee;
the bridge does not provide accounts, unlimited access or quota circumvention.

## Real client method

`node scripts/native-acceptance.mjs --live` starts the installed official OpenCode
runtime, an isolated bridge, and a real Codex app-server with ephemeral threads.
It uses fresh markers and temporary files, checks generated files independently,
re-runs the repaired test, refuses approvals, interrupts a live turn, injects a
short deadline, and verifies a subsequent turn completes. Tool actions run in the
Codex workspace. Original OpenCode workspace executors remain blocked; optional
alias names transfer back to the client instead.

Use `BRIDGE_INTERNAL_TOOLS=client-aliases` and set `BRIDGE_TEST_MODEL` to an
exact model ID from the table for the new workflow evidence. The default guarded
mode does not include alias translation.
`BRIDGE_TOOL_TRANSPORT=codemode` opts into the experimental dispatcher.
OpenCode 2.0.18 / Codex 0.157.1 / Node 24.4.1 / macOS were exercised live.
The 32k catalog value is an acceptance-test budget, not the provider's maximum.

## Receipts and negative evidence

Sanitized receipts are under [receipts/](receipts/). They contain model/runtime
versions, checks, timing and failure messages, not keys, prompts, raw tool output
or personal workspace paths. Later receipts include a source digest. Early
receipts do not identify every intermediate uncommitted revision; they are
exploratory history, not an exact release-build certificate.

- [Multi-model complete suites: Bunny, Nemotron, MiMo](receipts/alias-full-matrix/matrix.json).
- [Additional suites: LongCat, Big Pickle and failed Ling](receipts/alias-extra-full-matrix/matrix.json).
- [Initial repair screen including unsuccessful models](receipts/free-model-repairs/matrix.json).
- [First complete Nemotron alias suite](receipts/nemotron-alias-suite.json).
- [Earlier read/shell-only alias failure](receipts/nemotron-alias-repair.json).
- [Jev explicit registration diagnostic](receipts/jev-explicit-registration.json).
- [Ling endpoint diagnostic](receipts/ling-endpoint-diagnostic.json).
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

The transport milestone is commit `9f2a02e`; its source digest matches the new
live receipts. Subsequent multi-model preparation changes only configuration
artifact generation and the CLI, not the model transport. The final local suite
has 55 tests, including catalog/default/allowlist alignment, duplicate refusal,
argument injection and client-alias execution boundaries.

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

## Native streaming follow-up

Native streaming now uses the official live event API, with final snapshot
reconciliation and chronological message queries. Space Bunny passed a complete
real Codex suite on the streaming implementation. The first event implementation
had a reader shutdown timeout; explicit reader cancellation was then tested with
successive Responses and Chat requests. See [streaming evidence](native-streaming.md)
for revision-specific receipts and the limits of each test. Nemotron Code Mode
repair was also repeated on this source: two commands ran, then internal-tool
selection caused failure; no broader compatibility upgrade is claimed.

## Hidden internal tools follow-up

The bridge now offers opt-in `BRIDGE_INTERNAL_TOOLS=hidden`. The actual outgoing
HTTP tool list was checked in a guarded/hidden/guarded comparison. Nemotron
returned 200/403/200; Space Bunny returned 200/200/200 with correct client calls.
Space Bunny also passed two consecutive complete hidden-tool Codex suites. A prior development
run had a follow-up failure; reliability remains under investigation.
See [implementation and evidence](tool-surface.md). This replaces the earlier
assumption that removing the internal surface requires an upstream API change:
the official plugin API can remove it, but model access restrictions remain.

## Release boundary

The private candidate now has complete real-client evidence for five exact
models, rather than only a control model. The new behavior is opt-in; historical
guarded/hidden/Code Mode failures remain in the receipt set. Multi-model results
do not upgrade untested modalities, long context, provider availability, UI
integration or all future runtime versions.

Remaining release work includes broader tasks and repetitions, human-readable
file-edit UI parity, live Desktop picker acceptance and crash-recovery hardening.
No public release, account sharing, live-router restart or active Desktop-model
migration has occurred.
