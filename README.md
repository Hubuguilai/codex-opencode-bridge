# OpenCode models in Codex

**Get model access, paste one prompt into Codex, then choose your model.**
No repository download, terminal setup or configuration editing is required before
asking Codex to install it.

[中文教程](docs/README.zh-CN.md) · Private macOS Apple Silicon trial.
You need repository access while it remains private. Intel Macs are untested;
Windows/Linux desktop setup is not covered by this guide.

## 1. Choose your model

**Start with Big Pickle** for text, coding and file tasks. Our 2026-09-30 check
succeeded in a fresh OpenCode home without credentials. You can go directly to
step 2 and let Codex test current access. You do not need to buy Go to try this
route. Free availability and limits can change.

**For images, optionally add Muse Spark 1.3 Contributor Free.** It is listed in
the official free catalog, but our fresh unauthenticated check was country-denied.
Confirm that the exact model works in your OpenCode before requesting it here;
do not assume a subscription or a new key will remove a regional restriction.

[Step-by-step OpenCode access guide: free models, login and subscriptions](docs/opencode-access.md).
For Zen account access, open [OpenCode Zen](https://opencode.ai/zen), choose
**Get started with Zen / Login**, complete the account requirements and obtain
your own API key. Codex will guide local login if needed. Put keys only into the
local login terminal, never into chat. Zen onboarding may require billing; it is
not a prerequisite for the anonymous Big Pickle route tested here.

## 2. Paste this into Codex

Open a **local** Codex chat using a working model. Any empty project folder is
fine; you do not need this repository already open. Copy the whole prompt:

```text
Install codex-opencode-bridge on this Mac so I can choose Big Pickle in Codex.
Repository: https://github.com/Hubuguilai/codex-opencode-bridge
Version: onboarding-2026-09-30.
Actually perform installation and verification, not just give me instructions.
I have not downloaded it. Check my system and existing installation, then obtain
that version in a stable user-local project directory. Do not overwrite, reset
or delete an existing checkout. If private GitHub access is missing, tell me the
specific GitHub sign-in or collaborator-access step I need to complete.
Read docs/agent-install.md from that version and follow its maintained entry point
for dependencies, installation/resume and real verification. Do not invent a
second configuration procedure. You may install the private dependencies and run
Big Pickle text/file checks using my access. Do not buy credit, subscribe, or enable
paid fallback. Preserve my GPT models, other providers, login and existing settings.
Keep manual/ownership conflicts intact and diagnose them rather than force migration.
If I need to log in, give me one concrete local action; never ask for API keys in chat.
Report verified results, model-menu names, anything unverified, and whether I need
to fully quit and reopen Codex. On failure give the cause and one next step; do not
loop on permission or quota errors.
```

For Muse, append: **“I confirmed Muse Spark 1.3 Contributor Free works in my
OpenCode. Install it alongside Big Pickle and verify images too.”**

You may need to finish GitHub/OpenCode login or an Apple developer-tools dialog.
Return to the same chat afterward; Codex handles the remaining setup.

## 3. Reopen Codex and choose the model

After Codex reports passing checks, fully quit and reopen the app. Use the model
menu beside the message box:

| Selection | Menu name |
| --- | --- |
| Default | **Big Pickle (OpenCode Native Bridge)** |
| Optional vision model | **Muse Spark 1.3 Contributor Free (OpenCode Native Bridge)** |

Start a new chat: “Create hello.txt in this empty folder, write hello, then read
it back.” For Muse, also upload a non-sensitive image and ask about its contents.
If a task fails despite the menu entry, use the diagnostic prompt below.

## Something went wrong?

```text
Diagnose my codex-opencode-bridge installation. Locate the existing checkout and
installation record, then read docs/agent-install.md and docs/troubleshooting.md.
Do not overwrite configuration or reinstall blindly. Check status, services,
model registration and the exact failing model/input. Distinguish GitHub access,
missing dependencies, OpenCode login, region/model permissions, rate limits,
unsupported images and stream errors. Never print keys, auth files or private
conversation logs. Use only the maintained reversible recovery commands. Tell me
what failed, what you repaired and verified, and the one action I need to take.
```

## Later

Ask the same Codex chat to check health, add Muse after confirming access, upgrade
and verify, or uninstall while preserving other models and login. It should use
[the maintained runbook](docs/agent-install.md).

Only these two models are the initial onboarding scope. Native audio/video/PDF
input is unsupported. [Advanced usage and model evidence](docs/advanced.en.md)
and [this onboarding revision's actual checks and limits](docs/onboarding-verification.md)
remain available without making beginners read the implementation details.
