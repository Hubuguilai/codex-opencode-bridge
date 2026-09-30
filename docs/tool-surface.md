# Removing OpenCode's internal tool surface

## Implementation

`BRIDGE_MODE=native-tools BRIDGE_INTERNAL_TOOLS=hidden` uses official OpenCode v2
plugin interfaces. No runtime fork, rewritten identity or header spoofing is used.
Only the `direct` transport is supported with this option.

1. Remove all existing tool registrations through `ctx.tool.transform` before
   adding the current client's transfer stubs.
2. Filter `session.context.tools` to that exact client-tool allowlist, including
   removal of any definitions introduced after the registry transform.
3. Inspect primary outgoing HTTP JSON tool names. Refuse unparseable request
   bodies or unexpected tool names before sending them in hidden mode.
4. Retain the execution and permission guards. Unknown/internal tool calls must
   never perform work in the OpenCode workspace.

The context and HTTP hooks write only request IDs, mode, tool names and status
codes inside the managed temporary directory. They never write headers, prompts,
arguments or response bodies. Normal runtime shutdown removes that directory.
OpenCode's system context remains; this option removes the tool surface and does
not claim to remove all agent scaffolding or isolate third-party plugin code.
HTTP inspection currently covers the exercised flat function-tool protocol, not
arbitrary WebSocket or vendor-specific tool envelopes.

Official API reference: [OpenCode v2 plugins](https://opencode.ai/v2/docs/build/plugins).

## Controlled live evidence

The probe uses a fresh official OpenCode 2.0.18 server for each condition, the same
model, the same single echo schema and the same fixed prompt. It performs no
workspace operation and does not retry access failures. The ordered conditions
are guarded, hidden, guarded; client-call success requires matching arguments.

| Model | Guarded before | Hidden | Guarded after |
|---|---|---|---|
| `opencode/nemotron-3-ultra-free` | HTTP 200, correct client call | HTTP 403 | HTTP 200, correct client call |
| `opencode/space-bunny-free` | HTTP 200, correct client call | HTTP 200, correct client call | HTTP 200, correct client call |

In both hidden conditions the context and actual outgoing HTTP body contained
only `bridge_client_echo_0`. Guarded conditions also contained twelve internal
tool definitions. The receipts contain source digests for the implementation
that produced them:

- [Nemotron A/B/A receipt](receipts/nemotron-tool-surface.json)
- [Space Bunny A/B/A receipt](receipts/space-bunny-tool-surface.json)

This strengthens the association between removing the internal tool surface and
Nemotron's access rejection in this environment. It does not establish the exact
upstream enforcement rule, prove all accounts behave identically, or prove future
access. Do not restore fictitious executable tools or alter identity to evade a
rejection. The bridge reports 403 and the user can select an eligible model.

Reproduce with your own existing model access:

```sh
BRIDGE_TEST_MODEL=opencode/nemotron-3-ultra-free \
  node scripts/tool-surface-probe.mjs --live
BRIDGE_TEST_MODEL=opencode/space-bunny-free \
  BRIDGE_RECEIPT=generated/tool-surface-space-bunny.json \
  node scripts/tool-surface-probe.mjs --live
```

The probe uses ports 4796/4797 and removes its temporary runtime. Receipts contain
schema names and statuses only. This is a mechanism check; real client acceptance
is still needed for multi-turn tasks, cancellation, approvals and file changes.

## Real Codex workflow results

Two consecutive runs of the same runtime source with hidden tools and Space Bunny
passed all seven scenarios. The first completed:
creation (3 commands), same-thread follow-up (3 commands), Python repair
(4 commands plus a native file-change event), denied approval, cancellation,
timeout and recovery. The independent Python check passed without modifying its
test source. See the [first exact-source receipt](receipts/space-bunny-hidden-suite.json)
and [repeat receipt](receipts/space-bunny-hidden-repeat.json). The repeat used
3 creation commands, 3 follow-up commands and 3 repair commands plus a file change.

An earlier [development run](receipts/space-bunny-hidden-development-suite.json)
passed six scenarios but failed follow-up with a generic generation error. Its
source changed while it ran, so it is not an exact-source acceptance run. The
failure's cause is unresolved; do not claim that the later HTTP guard fixed it or
that two clean suites establish production reliability. The acceptance harness
now rejects source changes during a run. Broader tasks and additional models remain a gate.

```sh
BRIDGE_TEST_MODEL=opencode/space-bunny-free BRIDGE_INTERNAL_TOOLS=hidden \
  node scripts/native-acceptance.mjs --live
```

`BRIDGE_DEBUG_ERRORS` optionally names a private local diagnostic file for raw
upstream errors. It is not a sanitized receipt; keep it outside tracked files and
review before sharing. No raw error diagnostic was produced in either clean run.
