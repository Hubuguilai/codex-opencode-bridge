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

Before sending session creation, the managed bridge persists and syncs a private
intent under `state/work-*/.bridge-sessions/`. It contains only a random session ID,
working directory and timestamp, never credentials, prompts or output. A failed
journal write prevents creation. Only a confirmed creation followed by successful
deletion clears the intent. Lost creation replies retain an intent even after
successful DELETE because a late creation commit cannot yet be ruled out.

Stopping preserves a work directory with pending intents and emits
`runtime_recovery_pending`. It also preserves the directory if child termination
cannot be confirmed. `remove-prepared` refuses these leftovers. A process killed
before cleanup leaves its intent available for subsequent inspection.

## Recover abandoned sessions

After stopping the bridge, run:

```sh
node bin/bridge.mjs recover-prepared /absolute/new/bridge-config
```

This starts a temporary managed OpenCode runtime using the preparation's saved
upstream port and inherited OpenCode account environment. It sends no model
prompts and does not resume tasks. It inspects only `work-*` directories under the
preparation's state directory and skips its own temporary runtime.

New preparations of runtime state include a random run identity and parent/child
PIDs. Recovery requires the old child PID to be absent, plus either a confirmed
stop record or an absent parent PID. A live or reused PID blocks recovery. The
command never kills old processes. A crash between child spawn and ownership
recording is deliberately not recoverable automatically.

For each version-2 intent, run identity and directory must match the ownership
record. If the exact session exists, OpenCode must report the matching session ID
and directory before deletion. Recovery confirms absence afterwards; already
absent sessions need no deletion. It never enumerates or deletes other sessions.
This reconciles an ambiguous creation after the owning processes have stopped,
including a session that was created after the original cleanup attempt.

The command exits nonzero for unresolved state. Unexpected files or symlinks keep
the work directory intact even if owned session cleanup succeeded. Old version-1
intents, missing ownership records, and stale recovery locks require inspection;
there is no force option. The command does not automatically run on service start.

These records are accidental-misuse guards, not tamper-proof ownership proofs
against someone who can edit local files. Recovery assumes trusted local bridge
state and the same OpenCode data/account environment. Never bulk-delete sessions
from the user's OpenCode database. See the verification record for tested crash
boundaries; arbitrary crash timing and real generation recovery remain unproven.

## Reproduce without model generation

These commands launch the installed official runtime but send no model prompts:

```sh
node scripts/prepared-startup.mjs --live-runtime
node scripts/session-cleanup-probe.mjs --live-runtime
node scripts/recovery-probe.mjs --live-runtime
node scripts/crash-recovery-probe.mjs --live-runtime
```

The first uses temporary directories and ports 5096/5097; the second uses
5196/5197 plus an ephemeral local fault-injection proxy; recovery uses 5296/5297
and the late-commit/driver-crash probe uses 5396/5397.
They retain sanitized
receipts under `generated/` and clean their own sessions/directories. Startup
checks include authentication, exact model listing, two cycles and refusal to
remove a running preparation. The fault probe destroys the successful creation
reply and checks both target deletion and preservation of an unrelated session.
Recovery checks exact owned cleanup, already-absent intents, preservation of an
unrelated session, and removability of the preparation after the CLI completes.
The crash probe deliberately commits creation after the original cleanup has
finished, stops its own runtime child without updating the ownership phase, and
kills the bridge driver with SIGKILL. The actual recovery CLI then checks absent
PIDs, removes the late-created session and preserves an unrelated control.
On probe failure it retains temporary state for investigation rather than deleting
state underneath a potentially surviving runtime. This test does not establish
automatic handling of live orphan processes or crashes during recovery itself.
These results prove lifecycle behavior, not current model access or Desktop UI
installation. See [revision-specific receipts](verification.md).

## Access and quota failures

A listed model is not an entitlement guarantee. A live acceptance suite stops
on upstream access/quota denial. The matrix stops further model runs on HTTP 429;
no alternate account or model is used to escape that quota. Preserve the negative
receipt and inspect the provider's account/availability state before a later run.
The full-suite regression after the session-ID change encountered access/quota
denial; it must not be described as a successful generation regression.
