# Product target: use supported models through the native Codex workflow

Decision date: 2026-09-29. Owner clarification supersedes text-only v0.1 as the
product objective. The existing code remains an experimental transport baseline,
not the completed product. The repository remains private during development.

## User-visible outcome

Select an enabled model in Codex's ordinary picker, then use the same workspace,
tool UI, approvals, commands, file edits, cancellation and multi-turn conversation.
The user should not open OpenCode, delegate to a second agent, or move documents
between workspaces to finish a normal coding or document task.

Equivalent integration does not mean equivalent model intelligence, speed, context
size, vision, reasoning controls, quota, or provider-hosted tools. Publish an exact
model/version capability matrix rather than claiming universal feature parity.

## Required execution boundary

```text
Codex sends conversation + actual tool definitions
  -> bridge translates the model protocol
  -> authorized model endpoint returns structured tool calls
  -> bridge returns calls with stable IDs and intact arguments
Codex executes its own tools under its normal approvals/runtime
  -> tool results travel back through the bridge
  -> model continues until it returns a final answer
```

The bridge does not run shell commands or file edits on the model's behalf.
OpenCode internal agent tools must not substitute for Codex tools. If a runtime
transport is needed, it must relay the client's real tool schemas/calls/results
and prevent its own agent loop from independently performing those operations.

## Architecture routes

1. Prefer an authorized upstream structured inference API where the exact model
   supports client tool definitions. Translate Responses/Chat protocols while
   preserving roles, call IDs, tool results, streaming and failure semantics.
2. For models available only through an official local runtime, first establish a
   supported runtime extension capable of schema/call/result relay. The present
   session prompt interface alone is insufficient. Do not silently fall back to
   a nested OpenCode agent and call that native integration.
3. Models lacking either path remain explicitly experimental/unavailable for
   native agent tasks. Do not spoof client identity or evade provider restrictions.

Do not build another full router if existing Codex Router integration already
handles provider coexistence and the picker. Keep this project's responsibilities
focused on the OpenCode transport and verifiable client tool compatibility.

## First acceptance scenario

Use a disposable test project, not a real research manuscript:

1. Prepare a text file with a unique marker and two known values.
2. Ask the selected model in Codex to read that file, calculate a derived value,
   create a second Markdown file and run a local verification command.
3. Capture the structured tool calls and results from Codex's execution trace.
4. Verify the output artifact independently and confirm no file was created in
   the bridge/OpenCode work directory.
5. Send a follow-up edit and verify that the model uses the previous tool results.
6. Repeat with cancellation and a denied tool permission: no hidden execution,
   fabricated success or unbounded retry is acceptable.

Passing a greeting, a mocked tool event, a model-written JSON snippet or an HTTP
200 alone does not pass this gate. The model must complete a real Codex tool loop.

## Release gates

| Gate | Evidence required | Current state |
|---|---|---|
| Text transport | Real short responses, JSON and SSE | Passed for Nemotron prototype / v0.1 smoke |
| Native tools | Real file read/write/command/result loop executed by Codex | Five exact models passed complete client-alias suites; Nemotron repeated twice |
| Continuations | Multiple tool steps, follow-up edits, stable IDs/history | Passed same-thread create/follow-up/repair on five exact models |
| Lifecycle | Cancel, timeout, permission refusal, bounded retries | Real Codex app-server cancel/timeout/denial/recovery passed |
| Desktop UX | Picker coexistence, restart, reversible install/uninstall | Isolated Router protocol/catalog rehearsal and reversible preparation passed; live UI activation excluded |
| Optional features | Per-model vision, reasoning and context tests | No blanket claim |
| Public release | Reproducible supported-model matrix, docs and owner release decision | Private candidate prepared; public release not authorized |

## Source finding

On 2026-09-29, review of
[OpenCode2API's parser](https://github.com/TiaraBasori/OpenCode2API/blob/main/src/tool-runtime/parser.js)
found an explicit text-markup normalization path: the proxy prompts for tool markup
and recognizes multiple textual formats. This is a useful comparison, not proof
of native structured function calling or equivalent reliability. No code copied.

The inspected local OpenCode 2.0.18 OpenAPI schema exposes session prompt and
generate endpoints without arbitrary client tool-definition fields. This only
establishes a limitation of those endpoints, not that all extension approaches
are impossible. The official v2 plugin extension subsequently passed an exact-model structured
tool probe and real Codex execution; see [development evidence](native-tool-progress.md).


## Multi-model alias milestone

The optional client-alias implementation keeps all file/command execution in
Codex. Five exact models have passed complete suites and Nemotron repeated the
suite twice on the same runtime source. This advances the original runtime-only
model objective beyond the Space Bunny control. File aliases still appear as
commands, not patch diffs, and failed/unknown models remain explicit. See the
[model matrix](verification.md) and [alias contract](client-aliases.md).
