# OpenCode models in Codex

**Experimental prerelease: 0.2.0-rc.1.** [Verified scope and known limitations](docs/public-release.md).

**Get model access, paste one prompt into Codex, then choose your model.**
No repository download, terminal setup or configuration editing is required before
asking Codex to install it.

[中文教程](docs/README.zh-CN.md) · Experimental macOS Apple Silicon support.
Intel Macs are untested;
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

**Need an account/key? Follow this path:**

1. Open [OpenCode sign-in](https://opencode.ai/auth) and sign in with your **GitHub or Google** account.
2. Use the default workspace, or choose it under **Select workspace**.
3. If the home page has **Copy Key**, use it. Otherwise select **API Keys → Create API Key**.
4. Name it `Codex Bridge`, select **Create**, then copy the key using its row's copy icon.
5. Save it securely; **never paste the key into chat**. Continue to step 2 below.
6. When Codex provides a local login window, enter the key there, then return to
   the same chat and say “Login complete; continue.”

**Enable billing** is a billing action; **Subscribe to Go** is an optional
subscription. Neither should be confused with a required purchase for this bridge.
[Detailed registration guide, expected results and troubleshooting](docs/opencode-access.en.md).

## 2. Paste this into Codex

Open a **local** Codex chat using a working model. Any empty project folder is
fine; you do not need this repository already open. Copy the whole prompt:

```text
Install and configure codex-opencode-bridge in Codex on this Mac:
https://github.com/Hubuguilai/codex-opencode-bridge
Download the main branch, read README and docs/agent-install.md, and perform the
installation. I have not downloaded the project or prepared dependencies; handle those
for me rather than only giving instructions. Install Big Pickle by default; include
Muse only if I explicitly request it, and verify each selected model.
Use the maintained installer and preserve existing GPT models, other providers, login
and settings. You may run necessary model checks, but do not buy subscriptions, add
credit or enable paid fallback. If login or system authorization is needed, give me
one specific action at a time. Keys go only into a local login window, never this chat.
Report actual test results and the model name to select after reopening Codex.
Diagnose failures and repair reversible issues; state anything that still needs me.
```

For Muse, append: **“I confirmed Muse Spark 1.3 Contributor Free works in my
OpenCode. Install it alongside Big Pickle and verify images too.”**

You may need to finish OpenCode login or an Apple developer-tools dialog.
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
model registration and the exact failing model/input. Distinguish download failures,
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
