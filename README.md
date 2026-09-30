# codex-opencode-bridge

Use supported OpenCode models from Codex's model menu, with file and command
execution handled by Codex. The bridge runs locally through the official OpenCode
runtime and your own model access.

[中文说明](docs/README.zh-CN.md) · [Model access](docs/opencode-access.md) ·
[Verification](docs/verification.md) · [Release checklist](docs/release-readiness.json)

**Private development candidate: 0.2.0-rc.1.** The installer is implemented, but a
complete clean-machine desktop installation has not passed acceptance. There is
no public release yet. Upgrade and model-selection lifecycle checks have passed;
clean-client acceptance, current-release full model workflows and some first-install recovery remain open. Do not interpret an install
success message as certification of the model picker or every Codex feature.

## Start here

The first target is **macOS arm64**. macOS x64 has not been exercised; Windows and
Linux desktop installation are not certified. Install Codex and Node.js **22.19+
with npm** first. Python 3 is required for the file-tool compatibility aliases.
Git is needed when the installer downloads Router. Automatic Node installation is
not implemented.

1. Follow [OpenCode account and model access](docs/opencode-access.md). Use your own
   account; keys belong in a local login flow, not a chat or Git repository. Check
   that the exact model answers in OpenCode.
2. Obtain this repository. While private, access requires collaborator permission.
3. Run the installer from the repository directory, or copy the Prompt below into
   Codex with this repository open.

```sh
git clone https://github.com/Hubuguilai/codex-opencode-bridge.git
cd codex-opencode-bridge
node bin/bridge.mjs install
node bin/bridge.mjs verify --live
```

The installer reuses a compatible Router or downloads its pinned upstream source,
installs a private OpenCode 2.0.18 runtime, prepares the two default models, starts
a local service, checks its health, and registers the models through Router.
Existing provider identities are not silently replaced. It does not restart Codex.
See [the precise installer behavior and remaining gaps](docs/desktop-install.md).

`verify --live` uses your OpenCode access and can consume paid quota if applicable.
It starts an ephemeral Codex client, connects to the installed bridge, checks a
random text reply and a temporary file task for each model, then an uploaded image
for Muse. It leaves private receipts in the installation's `verification` directory.
It does not certify Router forwarding, the Desktop picker, image tool results,
permissions, full workflows or long context. Access/quota failure stops remaining
model checks. `doctor` and `status` remain read-only without model inference.

After successful installation, fully quit and reopen Codex. Look for:

- **Big Pickle (OpenCode Native Bridge)**
- **Muse Spark 1.3 Contributor Free (OpenCode Native Bridge)**

Select a model in the same menu used for GPT models. A new chat is recommended for
first verification. Menu visibility, a text answer, a successful file task, and
image understanding are separate checks. Existing manually configured entries may
have older names; the installer refuses identity collisions rather than adopting
them without ownership records.

## Copy this installation Prompt into Codex

```text
Install this codex-opencode-bridge checkout using its maintained installer.
Read README.md, docs/desktop-install.md and docs/opencode-access.md first.
Check macOS, Node 22.19+/npm, Git, Python 3, Codex, existing Router/configuration,
and my OpenCode model access. Preserve existing GPT models, other providers and
login. Do not ask me to paste credentials into chat; use local login flows.
Run the repository's install command. Use its existing backup and ownership
checks; do not bypass conflicts or erase incomplete installation records.
If human login or a Codex restart is necessary, explain that exact action.
After installation, run verify --live using my model access, report each result,
and then verify the actual model menu and independently test text,
file reading, file creation/modification, a follow-up turn and an applicable
permission denial. For Muse, test both an uploaded image and a view_image result
with image-only details unknown from the prompt. Record actual outcomes and
unverified checks separately. Do not claim native-GPT equivalence or complete
installation just because a service is healthy or a model answers a greeting.
```

## Models and current evidence

Last documentation reconciliation: **2026-09-30**. Catalog capacity and a configured
compression threshold are not proof of reliable full-capacity reasoning.

| Model | New-install context / auto-compression setting | Images | Evidence |
| --- | --- | --- | --- |
| Big Pickle | 200,000 / 160,000 tokens | Text only | Ten workflow scenarios passed on frozen commit 3a096e9; see the [receipt](docs/receipts/big-pickle-frozen-workflows-20260930.json) |
| Muse Spark 1.3 Contributor Free | 1,048,576 / 891,289 tokens | Uploaded images and client tool image results | Real Codex image/tool-result checks passed; ten workflow scenarios passed on frozen commit 3a096e9 |

Muse also completed a single near-capacity marker-retrieval probe using 1,041,600
total tokens. That does not certify sustained load, concurrent use, complex
reasoning at that length or the precise overflow boundary. See [capacity evidence](docs/muse-capacity.md)
and [image evidence](docs/images.md). Other models have historical experiments in
[verification](docs/verification.md); they are not all first-release supported models.

Unsupported: native audio/video/PDF input, provider-hosted tools, adjustable
reasoning levels, structured final-output formats, stored/background Responses and
`previous_response_id`. Model intelligence and upstream availability are unchanged.
Codex handles client tools; OpenCode still contributes runtime/system context.
See [security boundaries](docs/security.md) and [tool semantics](docs/client-aliases.md).

## Diagnose a problem

```sh
node bin/bridge.mjs doctor
node bin/bridge.mjs status
```

These commands are read-only. `doctor` checks prerequisites; `status` checks a
managed installation record, service health and published model entries. Neither
performs model inference. A missing managed record does not prove an older manual
installation is broken. Its
OpenCode lookup uses PATH/OPENCODE_BIN; it may not find a separately managed runtime
unless given its recorded path. The diagnostic Prompt below covers that distinction.
See [error meanings and recovery](docs/troubleshooting.md).

```text
Diagnose this codex-opencode-bridge installation without replacing configuration.
Read README.md and docs/troubleshooting.md. Start with the exact error and the
managed installation record, then check prerequisites, the recorded runtime,
service-status, local bridge health, model registration and provider access.
Do not print tokens, authentication files, raw conversation payloads or private
backups. Distinguish local authentication, upstream 401/403, local bridge_busy,
provider 429, unsupported content/tools, timeout and stream interruption.
Use the installed model and actual failing input mode; do not substitute a text
hello for an image or tool-result failure. Preserve evidence and existing models.
Use maintained recovery commands for reversible repairs. Stop on ownership
conflicts and explain the specific conflict. Never retry quota failures in a loop.
Report what was reproduced, changed, verified and still unknown.
```

New managed installations run a content-verified code copy under their installation directory. Updating the checkout does not silently update that service; repeat installation retains the selected copy. Older installations retain their existing service paths. Use the explicit upgrade commands below to switch versions.

## Repeat, change, update or remove

- **Repeat / recover a bridge-stage failure:** run the same `install` command with
  the same options. Owned files are checked; old plans/backups are retained.
- **Remove:** `node bin/bridge.mjs uninstall`. It removes this installation's model
  registration and service, preserving the existing Router, login, backups and
  preparation. Reinstall with the same `install` command.
- **Choose models on the first install:** use `--models` with documented exact IDs.
- **Change installed models:** finish active tasks, then pass the complete desired
  list to `node bin/bridge.mjs models --models opencode/big-pickle` to keep only
  Big Pickle, or `node bin/bridge.mjs models --models opencode/big-pickle,opencode/muse-spark-1.3-contributor-free`
  to enable both. This updates the service allowlist and Router catalog together.
  It preserves the local token and checks service health before publication.
  A failure restores the original selection; reopen Codex and verify actual tasks.
- **Interrupted model change:** run `node bin/bridge.mjs recover-models` before
  other installation operations. It restores the saved configuration and catalog.
  It refuses unrelated user edits rather than overwriting them. Use `uninstall`
  to remove the whole integration; an empty model list is not accepted.
  A later `install` without `--models` retains the recorded selection.
- **Upgrade:** finish active model tasks, then run `node bin/bridge.mjs upgrade`
  from the desired checked-out project version. It saves that code, installs its
  pinned OpenCode runtime if needed, switches only this bridge service and checks
  health. Model registration, credentials and prepared configuration stay intact.
  Startup failure triggers restoration and a health check of the old version.
- **Rollback:** `node bin/bridge.mjs rollback` switches to the previously selected
  managed code/runtime pair. Both copies are retained.
- **Interrupted upgrade:** `node bin/bridge.mjs recover-upgrade` restores the
  recorded pre-upgrade version. Use this before install/uninstall when an upgrade
  journal remains. Recovery refuses edited ownership records or code files.
  Legacy installations without independent code releases require migration;
  these commands currently explain that limitation instead of guessing paths.
- **Router bootstrap failure:** its separate incomplete record currently requires
  diagnosis. Bridge-stage resume does not claim to repair every Router setup phase.

These commands verify startup health, not model workflows. Recheck actual model tasks after upgrading. Upgrading the shared Router or migrating configuration formats is not yet automated.

The default state directory is `~/.local/share/codex-opencode-bridge/desktop`.
Use the same `--directory` on later operations if you chose a custom location.
Backups can contain sensitive local state; keep them private. Uninstall does not
mean deleting all logs, credentials or third-party dependencies.

## Development and release status

```sh
npm run check
npm test
npm run test:package
```

Live model acceptance consumes the account's allowance and requires explicit
operator authorization. See [verification](docs/verification.md),
[manual API/developer notes](docs/manual-api.md), [prior art](docs/prior-art.md),
[license](LICENSE) and [release gates](docs/release-readiness.json).

Release blockers include a clean supported-machine install from this README,
actual Desktop picker and signed-in GPT preservation, full current-source model
workflows, reboot/upgrade/lifecycle checks, and default-branch consistency. The
repository remains private until its owner authorizes publication.
