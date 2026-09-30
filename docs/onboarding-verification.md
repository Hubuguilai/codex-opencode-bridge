# One-prompt onboarding checks — 2026-09-30

This revision makes the README a three-step user entry point, adds a versioned
from-zero Codex prompt and a maintained `scripts/start.sh setup --live` entry point.
It defaults new users to Big Pickle; Muse is an explicit option after access checks.

## Checks completed

- **Missing Node:** started with a fresh temporary home and only macOS system
  tools on PATH. The launcher downloaded the pinned official Node archive,
  verified SHA-256, found the installed desktop's bundled Codex CLI and passed
  prerequisite checks. A second execution reused the private Node installation.
  [Receipt](receipts/onboarding-bootstrap.json).
- **No OpenCode credentials:** a separately installed pinned runtime with fresh
  HOME/XDG directories and a minimal environment answered the Big Pickle probe.
  Muse failed; a follow-up reported country restriction (403). This is not a
  claim that logging in or paying will resolve access.
  [Receipt](receipts/onboarding-anonymous-access.json).
- **Offline validation:** 227 tests passed, JavaScript/shell syntax checks passed,
  and the offline package check passed. New tests cover the live opt-in gate,
  prerequisite failure before mutation, default model selection, existing-choice
  preservation, installed-but-access-denied reporting, ownership conflicts and
  interactive-only login.

- **Real onboarding orchestration:** installed the new default Big Pickle selection
  in isolated client state, published the real Router catalog, started a real
  macOS bridge service and ran actual Codex text/file checks through Router.
  Both passed; repeat reused the installation and uninstall completed.
  This reused a prepared pinned Router dependency, a synthetic native catalog,
  and child-process Router services instead of restarting the user's shared Router.
  [Receipt](receipts/onboarding-rehearsal.json).

## Acceptance boundaries

A new temporary HOME is not a new macOS account or a clean machine. It still uses
this host's system developer tools and installed desktop application. The full
shared Router installer uses a fixed per-user launchd identity; running it in a
fake HOME under the same logged-in user could affect the active installation.
It was not used as a shortcut for clean-desktop acceptance.

The actual new-user desktop run — fetch the pinned tag, install a missing Router,
finish account/system prompts, reopen the app, and observe selection in its menu —
still needs a separate macOS user/machine. We have not asked another agent to
execute the prompt and have not claimed such an independent test occurred.
Existing manually modified Router installations remain a documented diagnosis
path, not a fully automatic migration.

Official public OpenCode documentation and landing-page labels were checked.
No signed-in account dashboard or purchase was exercised. The private-tag download check above records the original test environment; it is
not an instruction for public users. The updated README and agent runbook target
a public HTTPS clone of main, record the resolved commit and require no GitHub
account. Repository visibility remains an owner-controlled release action.

## Registration-guide revision

The public-facing prompts no longer contain private-repository access instructions
or the old onboarding tag. The registration guide now identifies GitHub/Google
sign-in, workspace selection, API Keys → Create API Key → copy, the new-user Copy
Key shortcut, and the exact local-login handoff. Relative links and both prompt
blocks were checked. Labels were verified against official source; a signed-in
browser walkthrough and account screenshots remain unperformed. See
[provenance](onboarding-sources.md). No runtime or active installation changed.
