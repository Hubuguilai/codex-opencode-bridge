# Client-executed tool aliases (experimental)

`BRIDGE_INTERNAL_TOOLS=client-aliases` addresses a concrete failure mode: some
models keep choosing OpenCode's familiar `read`, `write`, `edit` or `shell` names
instead of the supplied `bridge_client_*` names. The official plugin transforms
these four registrations into explicitly described **Codex-executed aliases**.
Their original OpenCode executors never run. Other internal tools remain blocked.

This is an optional compatibility path, not a change to provider eligibility.
It does not impersonate a client, modify authentication, or retry access/quota
failures. An upstream rejection remains a rejection.

## Execution and permissions

1. The client must supply one compatible `exec_command` function, either
   unnamespaced or under `functions`. Ambiguous/incompatible definitions do not
   enable aliases.
2. The plugin replaces the alias input schema, description and executor. A
   separate `execute.before` guard captures the translated call and throws before
   any original executor could run.
3. The bridge returns the **original client `exec_command` identity** and arguments.
   Codex owns execution, approval, sandboxing and the returned output.
4. The actual client call/result pair returns in the next conversation history.
   The bridge does not invent an OpenCode execution result.

| Alias | Client operation | Explicit boundary |
|---|---|---|
| `shell` | Original command and optional working directory | Background and execution-timeout parameters rejected; use client tools for process continuation |
| `read` | Python reads UTF-8 lines or lists a directory | One-based offset; at most 2,000 entries; no binary/image support |
| `write` | Python atomically replaces a UTF-8 file | Creates parents; existing file mode retained; new files use private temporary-file permissions |
| `edit` | Python performs exact string replacement and atomic write | Requires one match unless `replaceAll`; missing/ambiguous matches fail before modifying the file |

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

File aliases appear as **Codex command execution**, including their actual command
and approval UI. They do not manufacture a native `apply_patch` file-change event
or a human-friendly diff. Original supplied `apply_patch` remains available to
models that choose it. This path improves task completion; it does not establish
identical editing UI or full GPT feature parity.

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
