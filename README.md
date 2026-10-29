# Free OpenCode models in Codex

Keep using Codex, with a free model in its model menu.

Copy the prompt below and let Codex install the bridge. Reopen the app, pick
your installed model, and try it on a text or coding task. Your existing GPT models,
other providers and login stay in place.

You do not need to download this repository, open a terminal or edit configuration
before asking Codex to install it.

[中文说明](docs/README.zh-CN.md) · [Installation runbook](docs/agent-install.md)

![OpenCode models connected to Codex — concept illustration](docs/assets/readme-cover.png)

*Big Pickle is shown as an example; other candidates are listed below.*

## Free models to try

Catalog and official free pricing checked **2026-10-29**. Big Pickle remains the
first-install default, with historical text/file evidence. In a fresh no-login
**October 29 live check**, Flint failed at text and Big Pickle hit a rate limit;
the six remaining candidates were not run after the quota stop. No model passed
a new file-tool check in this run. A catalog listing does not confirm access.

| Current free candidate | Route in this project |
| --- | --- |
| Big Pickle | Default profile; October 29 text check hit a rate limit. Historical text/file checks passed. |
| MiMo-V2.6-Flash Free | Experimental profile; historical text/tool checks passed. |
| Flint 40B Free | October 29 text check failed (`generation_failed`); file tools not reached. Not an install option. |
| Beam Free | Catalog candidate; no maintained bridge profile. |
| DeepSeek V4.1 Flash Free | Catalog candidate; no maintained bridge profile. |
| GLM 5.3 Flash Free | Catalog candidate; no maintained bridge profile. |
| Nemotron 3.5 Lightning Free | Catalog candidate; no maintained bridge profile. |
| Nemotron 3.5 Super VL Free | Catalog candidate; no maintained bridge profile; images not verified. |

**Space Bunny Free, LongCat 2.5 Preview Free, LL Alpha Free and Muse Spark 1.2/1.3
Contributor Free are absent from the current API catalog.** They are no longer
suggested for new installations. Historical profiles and receipts remain for
existing installations; they do not establish current access. Nemotron 3 Ultra
Free is still free-priced but absent from the API.

Flint is the only added free ID since October 17. Its live check did not pass,
so no installer profile was added. The six candidates without a
maintained profile need adaptation and verification before the installer can
select them. No currently listed free candidate has a verified image route in
this project. DeepSeek V4.1 is distinct from old V4; no model is silently replaced.
[Exact IDs, catalog changes and dated test evidence](docs/free-models.md) ·
[October 29 live results](docs/receipts/free-models-live-20261029.json).
A follow-up diagnosed Big Pickle’s 429 as an upstream free-usage quota rejection;
the response did not expose its reset time. [Quota details](docs/free-models.md#october-29-quota-diagnosis).

To try MiMo with its existing profile, name it explicitly in the installation
chat. Ask Codex to follow the runbook, verify text/file tasks, and report failures
without silently changing models.

## 1. Let Codex install it

You need an installed Codex app and a working model to run the installation
prompt in a **local** chat. This installation guide targets **macOS Apple Silicon**.

Open a local chat in any project folder—even an empty one—and send this whole prompt:

```text
Install and configure codex-opencode-bridge in Codex on this Mac:
https://github.com/Hubuguilai/codex-opencode-bridge
Download the main branch, read README and docs/agent-install.md, and perform the
installation. I have not downloaded the project or prepared dependencies; handle those
for me rather than only giving instructions. Install Big Pickle by default and verify
each selected model. Check docs/free-models.md before selecting another model.
Use the maintained installer and preserve existing GPT models, other providers, login
and settings. You may run necessary model checks, but do not buy subscriptions, add
credit or enable paid fallback. If login or system authorization is needed, give me
one specific action at a time. Keys go only into a local login window, never this chat.
Report actual test results and the model name to select after reopening Codex.
Diagnose failures and repair reversible issues; state anything that still needs me.
```

Start with the default **Big Pickle**. You do not need to choose a model or buy an
OpenCode Go subscription first. Codex checks current access during setup.
If a login or an Apple developer-tools dialog is needed, complete that one action,
then return to the same chat so Codex can continue.

![Default installation workflow: paste the README prompt, reopen Codex after checks pass, and choose Big Pickle](docs/assets/readme-install-flow.png)

*The illustration shows the default Big Pickle route. If you installed another model, select that one instead.*

## 2. Reopen Codex and pick your model

After Codex reports passing checks, **fully quit and reopen the app**.
In the model menu beside the message box, select your installed model.
For the default installation, choose:

**Big Pickle (OpenCode Native Bridge)**

Start a new chat in an empty folder and send:

```text
Create hello.txt in this folder, write hello, then read it back to check the contents.
```

This checks that the selected model can use file tools, not just answer a greeting.
Once that works, try a small task in your own project: explain a script, edit a
function, or fix a failing check.

## What is verified?

Big Pickle answered without credentials in a fresh OpenCode home in our
2026-09-30 check. Actual Codex text/file tasks, repeat installation and uninstall
also passed using isolated client state.

The full first-time desktop installation on a separate Mac or a new macOS user
account, including reopening the app and observing its model menu, has not been
independently verified. This is an experimental prerelease, **0.2.0-rc.1**.

[Checks and receipts](docs/onboarding-verification.md) ·
[Verified scope and known limitations](docs/public-release.md)

## Questions and recovery

<details>
<summary>Is the default model free? Do I need an API key?</summary>

Big Pickle worked without an account or key in the check above. Free availability,
limits and regional access can change; the installer tests the route you can
actually use.

This gives Codex an OpenCode model option; it does not add quota to your GPT
subscription. No shared account or key is supplied.

If your selected route needs authentication, Codex provides a local login step.
Enter keys only there, never into chat. Buying Go, enabling billing or adding
credit is not a required installation step for the default route.

[Account and key instructions](docs/opencode-access.en.md)

</details>

<details>
<summary>Can I use images or another OpenCode model?</summary>

Big Pickle is for text, coding and file tasks; it does not support images.

The historical Muse Spark 1.3 Contributor Free profile supports image transport,
but its free ID is absent from the October 29 API catalog. It is no longer a
suggested new installation. Existing installations must recheck access before
using it; do not substitute the paid Muse model.

Big Pickle is the default onboarding route. MiMo V2.6 Flash Free has an
experimental text/tool profile. Other current candidates need maintained profiles
and verification first. The name “VL” does not enable images in this bridge.
Native audio, video and PDF input is unsupported. Intel Macs are untested;
Windows/Linux desktop setup is not covered by this guide.

[Model capabilities and evidence](docs/advanced.en.md)

</details>

<details>
<summary>The install failed, or the model appears but a task fails</summary>

Return to the installation chat and send:

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

A menu entry or a running service alone does not confirm that a model works.
Use the actual task check and reported failure to decide what to do next.

</details>

<details>
<summary>How do I update or remove it?</summary>

Ask the same Codex installation chat to check health, upgrade and verify, or
uninstall while preserving your other models and login.
It should follow the [maintained runbook](docs/agent-install.md).

</details>

If you find it useful, give it a star. If something fails,
[open an issue](https://github.com/Hubuguilai/codex-opencode-bridge/issues) with the
model name and a redacted error message—leave out keys and private chat logs.
