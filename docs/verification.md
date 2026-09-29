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


## Prepared startup and lost creation reply

The next implementation adds `serve-prepared` and preallocated session IDs.
[Real prepared startup](receipts/prepared-startup.json) passed two start/stop
cycles, exact five-model listing, rejection of missing/inherited wrong tokens,
second-instance isolation and removal after stop. No model generation was sent.
Its receipt hashes source and CLI files; it predates the session-ID change, which
does not change prepared startup.

[HTTP fault injection](receipts/session-cleanup-probe.json) used official OpenCode
2.0.18, accepted the client-selected ID, deliberately dropped the committed
creation response, and verified deletion of that exact session while preserving
an unrelated control. No model prompt was sent. Unit tests cover mismatched IDs
and disconnection paths. Persistent process-crash recovery remains incomplete.

A [new Nemotron full-suite attempt](receipts/nemotron-preallocated-session-suite.json)
was stopped by upstream access/quota rejection at generation time. Cancel/deadline
checks passed, but this is **not** a passing full model regression for the new
source. The earlier five-model success remains tied to its recorded revision.
The updated harness now stops a suite on access/quota denial, records its exact
HTTP status when available, and stops the remaining model matrix after HTTP 429.
It does not rotate identities or retry quota failures.

Local syntax checks and 59 offline tests pass at this milestone. See
[operations](operations.md) for reproducible commands and exact limits.


## Five-model Desktop integration preview

`prepare-router` exports a reviewable additions-only provider/model plan and a
combined menu preview. In the current local snapshot it preserved 53 entries and
added five. Unit tests check identity conflicts, original-file preservation and
absence of the bridge token in every output artifact. There were 61 offline tests at that milestone. [The five-route rehearsal](receipts/router-five-model-rehearsal.json)
validated the exported entries in the real installed Router stack against a mock
upstream, including completed call identity/namespace/arguments and real Codex
catalog parsing. It also verifies the source documents remain unchanged.

Actual live registration, service refresh, application restart and graphical
picker acceptance are still pending. The export must be revalidated against its
source hashes before applying. See [Desktop integration](desktop-integration.md).


## CLI installation regression

The CLI validates the complete command before configuration or filesystem
operations. Four subprocess regressions fail against the CLI from `a347585`
and pass with the strict parser: unknown/missing/duplicate arguments; preserving
a preparation when an unsupported `--dry-run` is supplied to removal; exact
multi-model selection with equals syntax/options before the path; and help with
no token creation or runtime launch. These use temporary directories only.

Syntax checks and all 65 offline tests passed at that milestone. This improves installation
behavior; it adds no new evidence of provider availability or graphical picker
activation.


## Durable session intents

Syntax checks and all 69 offline tests passed at the durable-intent milestone. The new tests verify intent
persistence before creation, refusal to call upstream on journal-write failure,
retention on failed deletion or ambiguous creation, and readable exact identity
after a separate process is killed with SIGKILL. The latter uses a fake upstream;
it proves persistence, not automatic recovery of a real model task.

[The official-runtime fault probe](receipts/session-journal-probe.json) dropped a
committed creation reply and verified exact target deletion, preservation of an
unrelated session, and retention of the ambiguous intent through runtime stop.
[Prepared startup](receipts/prepared-startup-journal.json) still passed two cycles,
second-instance isolation and removal after clean stop. Both use OpenCode 2.0.18
and send zero model generation requests. They record source hashes separately
from the older model-generation receipts. Automatic recovery replay and ownership
verification remain unimplemented; see [operations](operations.md).


## Explicit ownership-aware recovery

`recover-prepared` now uses version-2 intents and per-runtime ownership records.
All 76 offline tests pass, including rejection of possibly live/reused PIDs,
identity/location mismatches, legacy records, symlinked intents, recovery locks
and unconfirmed deletion. Unknown files remain intact after session cleanup.

[The real recovery CLI probe](receipts/recovery-probe.json) uses OpenCode 2.0.18
without generation. It creates an owned session, an already-absent intent and an
unrelated control; stops the original runtime; runs the new CLI; then starts a
fresh verifier runtime. Both intended IDs are absent, the unrelated session is
preserved, and the preparation is removable. The receipt hashes source plus CLI.
This exercises confirmed-stop recovery, not arbitrary crash timing or a real
model request committing late. Forced-process termination persistence has separate
unit evidence; full crash/recovery timing coverage remains open.

[The same-source prepared startup regression](receipts/prepared-startup-recovery.json)
also passes two normal cycles, second-instance isolation and clean removal with
all five configured model routes. This startup check sends no generation calls.


## Creation after cleanup and abrupt driver exit

[The deterministic crash probe](receipts/crash-recovery-probe.json) expands the
real-runtime evidence at the same source/CLI hash as the explicit recovery probe.
A local proxy drops creation before forwarding it, lets the bridge finish its
original interrupt/delete cleanup (DELETE returns 404), and only then commits the
staged creation into official OpenCode 2.0.18. No prompt reaches inference.

The probe stops its owned runtime child without writing a stopped ownership
record, kills the driver with SIGKILL, and verifies both recorded PIDs are absent.
The actual `recover-prepared` CLI then clears the late-created session and its
work directory. A fresh verifier runtime confirms the target is absent and an
unrelated control survives; preparation removal succeeds. Thus the evidence covers
one concrete late-commit and abrupt-driver-exit sequence, not arbitrary crash
scheduling or a live orphan runtime. Crashes during recovery and the child-spawn
ownership-recording window remain unproven. All 76 offline tests still pass.


## Native patch alias and real Codex file events

The optional client-alias mode now registers `apply_patch` when the client supplies
one compatible original custom patch tool. Patch bytes, original identity and
namespace are retained; the plugin captures the call before runtime execution.
The supplied patch format/description is included in alias guidance. Command/file
aliases retain their distinct semantics and are not converted into patches.

[The real Codex client probe](receipts/patch-client-probe.json) uses Codex 0.157.1
with a deterministic fake model and the actual plugin hook implementation. Create
and update each produce a native fileChange item with diff content and exact file
bytes; denial produces an approval request, leaves the file absent and returns the
real tool result. No commandExecution occurs. There is no provider inference, and
this is not a visual Desktop test or a live OpenCode registry/model validation.

All 79 offline tests pass, including patch alias registration/replacement,
ambiguous target rejection, byte preservation and backend custom-call identity.
The updated model-facing tool surface and preference need per-model live
regression; older five-model passes remain bound to their recorded source.
