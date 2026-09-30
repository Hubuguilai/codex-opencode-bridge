# One-prompt installation runbook

This is the authoritative procedure for the Codex agent executing the README
prompt. Do the work; do not ask the user to clone, edit TOML, pick ports or manage
background services. This is the installation procedure for users of the public project.

## 1. Obtain the requested version

Target macOS (Apple Silicon exercised). Preserve existing checkouts and client
state. A suitable new checkout location is
`~/.local/share/codex-opencode-bridge/source`; use absolute paths in execution.

Check Git first. If Apple's Git/Python developer tools are missing, initiate
`xcode-select --install` and ask the user to finish that specific system dialog.
Resume the same task when they return. Do not repeatedly run the installer.

Clone the public repository over HTTPS; GitHub login, GitHub CLI and collaborator
invitations are not prerequisites:

```sh
git clone --depth 1 --branch main https://github.com/Hubuguilai/codex-opencode-bridge.git "$HOME/.local/share/codex-opencode-bridge/source"
```

Create the parent directory first. Record the resolved commit with `git rev-parse HEAD`
and keep the same checkout throughout this installation. If the user explicitly
requested a release/tag, resolve and use it instead. Do not use the obsolete
initial onboarding tag as the default: it contains older onboarding instructions.
For an existing checkout, verify its remote and local state; preserve modifications
and existing installed versions. Never use reset --hard or delete it to make room.
A public clone does not need a GitHub token. If downloading fails, check the URL,
network and repository availability, then report the exact obstacle. Do not ask
new users to become collaborators or collect GitHub credentials in chat.

Read this file from the checked-out version before proceeding.

## 2. One maintained entry point

From that checkout:

```sh
bash scripts/start.sh setup --live
```

This prepares a private SHA-256-verified official Node distribution if a suitable
Node/npm is absent, locates a Codex CLI on PATH or inside a known desktop bundle,
checks Git/Python/Codex, and runs the same managed install + Router verification
used by the project. It does not install a second global OpenCode. New quickstart
installs choose **Big Pickle only**; reruns preserve an existing managed selection.
The lower-level `install` command has different historical defaults: do not
substitute it for `setup`.

If the user explicitly selected both models on the first install:

```sh
bash scripts/start.sh setup --live --models opencode/big-pickle,opencode/muse-spark-1.3-contributor-free
```

For an existing managed install with a different selection, use `models` below,
then verify; do not erase its installation record. Ordinary progress appears
while model checks run. Use the final structured result and receipt, not a service
health response, to decide whether verification passed.

The runtime logs in as the current OS user through OpenCode's own credential
store. No model key should be passed as a CLI argument, placed in this repository,
or transmitted through chat. A free route can work without a key; test rather
than assuming every model requires one. Country-denied Muse is an access failure,
not evidence that paying or logging in will fix it.

## 3. Human intervention only when required

- **Node missing:** launcher handles it in a private directory without sudo.
- **Git/Python missing:** the Apple developer-tools dialog may need the user.
- **Codex CLI missing:** look inside the actual installed Codex/ChatGPT application
  bundle first. If absent, follow current official OpenAI CLI installation docs;
  install the official `@openai/codex` package in a private npm prefix and add its bin directory to this execution's
  PATH. Do not replace an existing global CLI or modify shell profiles. Re-run
  the maintained entry point. This fallback needs an official CLI version with
  `app-server`; it is not an assertion that every desktop build bundles a CLI.
- **OpenCode authentication required:** open an interactive local terminal at the actual checkout when available,
  then run the following command for the user. Otherwise provide one copyable
  command containing the quoted absolute checkout path and the login command.
  Do not ask a beginner to work out which directory to open. It installs/reuses
  the pinned runtime and opens official Zen login. Let the user type the Key
  themselves; do not capture the terminal during secret entry.

  ```sh
  bash scripts/start.sh login
  ```

  On return, rerun `setup --live`. Do not use a Go key as a presumed Zen entitlement.
- **403/region/model missing:** confirm the exact route in OpenCode. Stop that
  model; do not buy access, rotate keys or silently substitute another model.
- **429:** stop; report provider retry/reset guidance, no reinstall loop.
- **Existing manual Router/bridge:** preserve it. Use read-only `status` and
  `migration-preflight` as appropriate. The experimental legacy migration module
  is not a supported one-click user command. Report the conflict instead of
  deleting records, patching arbitrary source, or forcing adoption.

## 4. Finish in plain language

Give the installed model names, text/file/image check outcomes, private receipt
location, and one next action: completely quit/reopen Codex and pick the model in
a new chat. Do not restart the user's app automatically. If the desktop menu was
not actually observed, say so. Report partial failure accurately: installed
services with a failed model check are not a successful installation.

Do not promise identical GPT behavior, guaranteed 1M reasoning, or unlimited
free access. Account billing, model availability and privacy terms remain upstream.

## Management uses the same launcher

```sh
bash scripts/start.sh status
bash scripts/start.sh verify --live
bash scripts/start.sh models --models opencode/big-pickle,opencode/muse-spark-1.3-contributor-free
bash scripts/start.sh upgrade
bash scripts/start.sh rollback
bash scripts/start.sh recover-upgrade
bash scripts/start.sh recover-models
bash scripts/start.sh uninstall
```

Use the same `--directory` for custom installations. Read the saved state before
selecting a recovery action. Upgrade from an explicitly chosen newer checkout;
rerunning a checkout does not automatically upgrade an existing installation.
After a model change or upgrade, verify again. Preserve backups after uninstall.
See [advanced lifecycle details](advanced.en.md) only when needed.

Official CLI package reference: [OpenAI installation example](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex).
