# Native tool compatibility evidence (development)

Date: 2026-09-29. This is a development record, not a release acceptance claim.
Repository remains private. This is a chronological development notebook;
intermediate limitations below are superseded where noted. The current support
contract is [verification.md](verification.md).

## Implemented transport

The managed OpenCode v2 runtime loads this project's plugin through the official
[v2 plugin API](https://opencode.ai/v2/docs/build/plugins). The plugin registers
client tool JSON schemas as direct function tools with Code Mode disabled. Their
executors only capture structured arguments and wait for cancellation. The bridge
returns Responses function/custom-tool call items, including original names,
namespaces and call IDs, to Codex. Codex executes its own tools and supplies their
results in the next request. OpenCode internal actions are denied by both the
permission hook and before-execution hook. No text-markup tool parser is used.

Each generation uses a temporary upstream session. The initial bridge serialized client conversation roles and tool results into a
prompt. Later work replaced that path with native OpenCode message and tool-result
structures, while mapping system/developer instructions to its single system role.
The managed work directory and plugin guards are not an operating-system sandbox.
Users must trust their installed OpenCode runtime and global configuration.

## Real client receipt

OpenCode 2.0.18, Codex CLI 0.157.1, Node 24.4.1, macOS.
Model: `opencode/nemotron-3-ultra-free`.

An ephemeral `codex exec` used an isolated bridge provider and disposable client
workspace. A JSON fixture contained a fresh UUID marker and values 173 and 269.
The requested task was to read it, write a Markdown output and execute a Python
assertion. The runtime emitted five actual Codex command-execution events and
completed with exit code zero. The harness independently checked the output:
marker preserved, sum 442 present, output file present in the client workspace,
and no corresponding output in the managed OpenCode workspace. Three reads were
redundant; this run demonstrates feasibility, not efficiency or reliability.

The raw traces are intentionally not committed: they include machine paths and
model-generated intermediate content. A portable repeatable harness and aggregate
acceptance receipt are required before release.

## Failures retained

App-server continuation probes initially failed before any tool ran because a
user-level reasoning-effort setting was inherited. Both create and follow-up
requests returned explicit HTTP 422. Setting the legacy
`model_supports_reasoning_summaries=false` alone did not prevent that field.
The compatibility contract now accepts only an omitted effort or an explicitly
advertised `default` value, meaning preserve the upstream default. Adjustable
values remain unsupported and return 422. The client configuration must select
this default explicitly. This does not disable or tune upstream reasoning.

## Pending acceptance

- Repeat real file/command tasks and repair a failing test.
- Same-thread follow-up edits through Codex app-server.
- Real client denial and cancellation with no hidden execution; recovery.
- Native-mode lifecycle race tests, installation/restore and picker coexistence.
- CI, portable receipts, supported feature matrix and release candidate review.

A subsequent real app-server run completed both turns in one ephemeral Codex
thread: create/read/verify (4 commands), then preserve marker/sum and append the
product 38497 (3 commands). Both independently checked outputs passed. The
necessary configuration is a dedicated model catalog plus
`model_reasoning_effort="default"` and `model_reasoning_summary="none"`; an inherited
summary setting also produced a recorded 422 before this was corrected.

## Subsequent scenario receipts

The portable first suite passed creation (3 commands), follow-up (4 commands)
and a real denied approval (1 command event, target file absent). Repair failed
before execution; the initial harness did not retain that failure's error message.
A focused repair attempt then failed after one command because the model chose a
blocked internal tool. Filtering all internal definitions through the context
hook caused an upstream access/quota rejection before any client tool ran. That
filter was removed; no identity changes or access-error retries were added.

A later focused repair run completed with 3 command executions and a native Codex
file-change event. The independently rerun Python test passed and its source was
unchanged. The corrective-retry implementation was present, but no corrective
retry was reported in that run; do not attribute the success to an unobserved retry.

A live lifecycle run passed: interrupting an active Codex turn released the
backend and removed the request manifest; a 100 ms generation deadline returned
HTTP 504 with `request_cancelled`; a subsequent real Codex turn completed normally.
These are separate scenario passes, not a clean full-suite reliability certificate.

## Candidate closure

Native message history and descriptive client-tool aliases were implemented;
Nemotron still produced blocked internal-tool choices. An experimental Code Mode
dispatcher permitted only the documented restricted JavaScript dispatcher while
retaining nested workspace-tool guards. A repair reached passing Python checks
but did not complete its turn within 180 seconds. It remains a failed gate.

Space Bunny Free, used as a control, passed a focused repair and then two complete
suites across the final development revisions. The candidate receipt includes
a source digest. The final offline suite has 36 passing tests. An independent
Router/LiteLLM/API-forwarder rehearsal with generated credentials and a mock
upstream also passed and removed its temporary state. See the current matrix and
committed receipts rather than pooling exploratory runs into performance scores.

## Hidden internal tool surface follow-up

Official registry transforms plus context filtering now implement opt-in hidden
internal tools. The primary outgoing HTTP tool list is audited and unexpected
names are rejected. A guarded/hidden/guarded probe measured Nemotron 200/403/200
and Space Bunny 200/200/200. The hidden requests contained only the client stub.
This replaces any earlier inference that the plugin cannot remove internal tools.
Two consecutive complete Space Bunny Codex suites passed with the same runtime
source digest. A prior development run had a failed follow-up and is retained;
no causal claim about that transient failure is made. See [tool surface evidence](tool-surface.md).

## Native streaming follow-up

Streaming native requests now subscribe to official v2 session text events before
prompting, scope them to the current session, and reconcile terminal snapshots.
Snapshots alone did not yield incremental text in the live control. Explicit
reader cancellation resolved the reproduced shutdown stall in the subsequent
probe; chronological snapshot order also avoids selecting an older dispatch step.
A full Space Bunny Codex suite passed on this implementation. See [streaming evidence](native-streaming.md).


## 2026-09-29 — multiple real-client models through explicit aliases

Official plugin transforms now turn `read`, `shell`, `write` and `edit` into
honestly described client-executed aliases. A separate before hook prevents
original runtime execution. File translations return fixed Python commands to
Codex; client approvals and actual output remain authoritative.

On runtime source `e0c3f0b79b53bbf2ead5992d2441511b2ccac1c7265021f1036b62e3e9944298`,
Nemotron 3 Ultra Free passed two complete suites; Space Bunny Free, MiMo V2.6
Flash Free, LongCat 2.5 Preview Free and Big Pickle each passed a complete suite.
The prior read/shell-only Nemotron failure is retained. Lightning repair timed
out twice; Ling reported an unavailable endpoint; explicitly registered Jev
returned upstream 500. These are not silently dropped from the support matrix.

Five added regression tests cover alias compatibility, argument injection,
file mutation bytes/modes/ambiguous matches and prevention of original executor
use. There are 53 offline tests at this transport milestone. File aliases show
command activity, so native patch UI parity remains incomplete. All receipts and
exact support boundaries are in [verification](verification.md).
