# Running a prepared multi-model bridge

Commands reject unknown or repeated options, missing values and extra arguments
before creating configuration or removing files. Use `COMMAND --help` to inspect
usage without starting a runtime. There is no `--dry-run` removal option; passing
one fails and preserves the preparation. `prepare-router` is itself export-only.
Quote paths containing spaces. Options may precede or follow the directory; use
`--` before a directory whose name starts with a hyphen.

After `prepare`, start the exact saved configuration:

```sh
node bin/bridge.mjs serve-prepared /absolute/new/bridge-config
```

The command loads the selected models, native/client-alias mode, ports and token
file. Existing `BRIDGE_*` environment variables cannot silently select another
provider route, authentication token or timeout. OpenCode's executable path,
credentials and proxy environment are still inherited. Current Codex settings and
other running bridges are not edited.

Stop with Ctrl-C. The bridge closes requests and stops its managed runtime. The
same preparation can then be started again with the same command and local token.
The generated directory must stay at its original location because its state and
catalog paths are absolute. For different settings or a different location,
prepare a new directory. Ordinary `serve` remains available for explicit manual
environment configuration.

`serve-prepared` checks file hashes and refuses symlinked state/token entries.
These are accidental-modification guards, not signatures or a security boundary
against someone who can rewrite the manifest and files. Use trusted preparations.
A second process trying the same ports must fail without replacing the first.

Once stopped, remove an unmodified preparation with:

```sh
node bin/bridge.mjs remove-prepared /absolute/new/bridge-config
```

Removal refuses edited files and remaining runtime directories. It never removes
provider authentication or another application's model catalog.

## Recovery guarantees and limits

The official OpenCode v2 creation API accepts a caller-selected session ID. The
bridge chooses a fresh random ID before sending creation, so it retains a cleanup
target if the runtime commits the session and the HTTP reply is lost. It rejects
a different returned ID and does not delete that unrelated ID. Cleanup uses
independent bounded requests and does not depend on the cancelled client signal.

This does not cover a process killed before cleanup, an unavailable runtime, or a
creation that commits after the cleanup attempt. Those require a persistent
recovery journal and runtime ownership checks; the roadmap keeps that work open.
Do not bulk-delete sessions from the user's OpenCode database.

## Reproduce without model generation

These commands launch the installed official runtime but send no model prompts:

```sh
node scripts/prepared-startup.mjs --live-runtime
node scripts/session-cleanup-probe.mjs --live-runtime
```

The first uses temporary directories and ports 5096/5097; the second uses
5196/5197 plus an ephemeral local fault-injection proxy. They retain sanitized
receipts under `generated/` and clean their own sessions/directories. Startup
checks include authentication, exact model listing, two cycles and refusal to
remove a running preparation. The fault probe destroys the successful creation
reply and checks both target deletion and preservation of an unrelated session.
These results prove lifecycle behavior, not current model access or Desktop UI
installation. See [revision-specific receipts](verification.md).

## Access and quota failures

A listed model is not an entitlement guarantee. A live acceptance suite stops
on upstream access/quota denial. The matrix stops further model runs on HTTP 429;
no alternate account or model is used to escape that quota. Preserve the negative
receipt and inspect the provider's account/availability state before a later run.
The full-suite regression after the session-ID change encountered access/quota
denial; it must not be described as a successful generation regression.
