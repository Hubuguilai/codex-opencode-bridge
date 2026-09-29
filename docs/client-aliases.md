# Client-executed tool aliases (experimental)

`BRIDGE_INTERNAL_TOOLS=client-aliases` addresses a concrete failure mode: some
models keep choosing OpenCode's familiar `read`, `write`, `edit` or `shell` names
instead of the supplied `bridge_client_*` names. The official plugin transforms
these four registrations into explicitly described **Codex-executed aliases**.
Their original OpenCode executors never run. When Codex supplies an unambiguous
custom `apply_patch` tool, the plugin also adds or replaces `apply_patch` with a
native patch transfer stub. Other internal tools remain blocked.

This is an optional compatibility path, not a change to provider eligibility.
It does not impersonate a client, modify authentication, or retry access/quota
failures. An upstream rejection remains a rejection.

## Execution and permissions

1. The client must supply one compatible `exec_command` function, either
   unnamespaced or under `functions`. Ambiguous/incompatible definitions do not
   enable command/file aliases. The patch alias independently requires one custom
   `apply_patch` tool, unnamespaced or under `functions`; it needs no shell tool.
2. The plugin replaces the alias input schema, description and executor. A
   separate `execute.before` guard captures the translated call and throws before
   any original executor could run.
3. The bridge returns the **original client tool identity** and arguments:
   `exec_command` for command/file aliases, custom `apply_patch` for patch input.
   Codex owns execution, approval, sandboxing and the returned output.
4. The actual client call/result pair returns in the next conversation history.
   The bridge does not invent an OpenCode execution result.

| Alias | Client operation | Explicit boundary |
|---|---|---|
| `shell` | Original command and optional working directory | Background and execution-timeout parameters rejected; use client tools for process continuation |
| `read` | Python reads UTF-8 lines or lists a directory | One-based offset; at most 2,000 entries; no binary/image support |
| `write` | Python atomically replaces a UTF-8 file | Creates parents; existing file mode retained; new files use private temporary-file permissions |
| `edit` | Python performs exact string replacement and atomic write | Requires one match unless `replaceAll`; missing/ambiguous matches fail before modifying the file |
| `apply_patch` | Original custom Codex patch tool | `patchText` is transferred byte-for-byte; Codex validates patch syntax and owns file changes/approval |

File aliases require `python3` in the **Codex client environment** and a POSIX
shell. Paths/content are base64-encoded JSON arguments to a fixed quoted program,
not interpolated executable source. Encoded input is limited to 48,000 bytes;
larger operations must use original client tools. Python output and errors are
real client results. Encoding is not encryption or a permissions mechanism.

Existing file symlinks resolve to their targets. Atomic replacement preserves
mode bits, but does not promise preservation of inode identity, hard-link
relationships, extended attributes, ACLs or concurrent edits. The path and its
parents are subject to Codex's actual execution permissions; this adapter is not
an independent filesystem sandbox.

## User experience limit

The `apply_patch` alias uses the actual Codex patch tool and prefers that tool in
model guidance. A real Codex client test produces native `fileChange` events and
diffs for file creation and modification; denial leaves the target absent and
returns the real result to the next turn. It uses a deterministic fake model and
the plugin hooks, not a live OpenCode model; model selection reliability and the
updated upstream tool surface still need per-model revalidation.

`write` and `edit` remain **Codex command execution** with their actual command
and approval UI. They are not silently converted to patches: full-file writes,
exact-string matching and patch matching have different semantics. Original
`bridge_client_*` tools remain available. The new patch route improves native
editing integration but does not establish full GPT feature parity or visual
Desktop acceptance.

Reproduce client execution without provider inference:

```sh
node scripts/patch-client-probe.mjs --client
```

## Reproduce across models

Run a single complete suite:

```sh
BRIDGE_INTERNAL_TOOLS=client-aliases \
BRIDGE_TEST_MODEL=opencode/nemotron-3-ultra-free \
node scripts/native-acceptance.mjs --live
```

Run sequential suites with one receipt per exact model:

```sh
BRIDGE_MATRIX_DIR=generated/my-matrix \
node scripts/model-matrix.mjs --live \
  --models opencode/nemotron-3-ultra-free,opencode/jev-1.13-free
```

Add `--repair-only` for an initial real-client repair screen. Passing that screen
is not a complete workflow certificate. The matrix never switches account,
falls back to a different model or retries a rejected provider identity. Receipts
include source hashes and retain unsuccessful models alongside successful ones.
Current results belong in [verification](verification.md), not inferred from the
model list or from a successful greeting.

### Native patch screen

When upstream access is available, run the exact five-model patch screen:

```sh
BRIDGE_MATRIX_DIR=generated/patch-matrix \
node scripts/model-matrix.mjs --live --patch-only \
  --models opencode/space-bunny-free,opencode/nemotron-3-ultra-free,opencode/mimo-v2.6-flash-free,opencode/longcat-2.5-preview-free,opencode/big-pickle
```

This performs three real-model scenarios per model: native patch creation,
follow-up modification and rejection of patch approval. Create/update require
exact file contents, native file-change and diff events, zero command execution,
and no corresponding file in the OpenCode workspace. Denial requires exactly one
denied approval and no created file. It is a live test, not a free offline check.

The default full suite now contains ten scenarios: the original seven plus these
three patch cases. `--repair-only`, `--patch-only` and `--lifecycle-only` are mutually
exclusive; misspelled/unknown options fail before any runtime starts. Both scripts
require explicit `--live`.

A pass requires every named scenario and its required checks, matching test mode,
exact model identity and stable source revision. The matrix cannot combine passes
from different source hashes. Partial or duplicate scenarios cannot stand in for
the requested suite. Historical seven-scenario receipts retain their original
scope; they do not certify the expanded ten-scenario suite. A patch-only pass also
does not certify the full suite or graphical Desktop behavior.
