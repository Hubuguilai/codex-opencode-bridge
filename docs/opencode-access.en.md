# Get an OpenCode account and key, then let Codex install the bridge

You need a browser and a working local Codex chat. You do not need to install
OpenCode Desktop or buy Go first. To try Big Pickle without an account, start
with the [README install prompt](../README.md#2-paste-this-into-codex); return here
if authentication is needed.

[中文详细教程](opencode-access.md)

## 1. Open the account page

Open [OpenCode Zen](https://opencode.ai/zen) and select **Get started with Zen**
or **Login**, or use the [direct sign-in link](https://opencode.ai/auth).
You should see a sign-in choice or your existing console. **Subscribe to Go** is
a separate subscription action; it is not the account-registration step.

## 2. Sign in with GitHub or Google

Choose your own **GitHub** or **Google** account. Complete the account's sign-in
and, if shown, review the authorization for OpenCode yourself. First-time users
start through this same entry; do not look for a separate email/password form.
If email verification is requested, finish it with that account and retry.

Success means the browser returns to the OpenCode console. GitHub is one optional
OpenCode login method; downloading this public bridge does not require a GitHub account.

## 3. Select a workspace

Use your existing/default workspace. If prompted, open **Select workspace** and
choose your own. To create one, select **+ Create New Workspace**, enter a name
such as `Personal` into **Enter workspace name**, and select **Create**.

You should now see entries such as **Zen**, **Go**, **Usage**, **API Keys**,
**Billing**, and **Settings**. Keep the same workspace for keys and quota checks.

## 4. Copy or create your API key

If the new-user page already offers **Copy Key**, select it; **Copied!** confirms
that it was copied. Otherwise:

1. Select **API Keys**.
2. Select **Create API Key**.
3. Enter `Codex Bridge` in **Enter key name**. This is a label, not the secret itself.
4. Select **Create**.
5. Find that row and use the copy icon beside its Key value (**Copy API key**).

The copy icon briefly becomes a check mark. Copy through the button; do not type
out the masked value containing stars. Store it in your password manager if needed.
Do not send it to Codex chat or include it in screenshots or GitHub files. If a
team member's key is not copyable, create your own key instead.

## 5. Decide whether billing is relevant

Account registration, possessing a key, and access to a particular model are
separate steps. **Enable billing** means Zen billing; **Subscribe to Go / Go Plus**
means an optional subscription. Neither is a universal requirement for the tested
anonymous Big Pickle route. The installer never purchases access for you.

If your chosen account route requires billing, decide whether to proceed yourself.
A Free catalog entry does not guarantee anonymous access, account eligibility or
availability in every country. For Muse, select the exact **Muse Spark 1.3
Contributor Free** name, not a similarly named paid model.

## 6. Paste the README prompt into Codex

Return to [step 2 in the README](../README.md#2-paste-this-into-codex), copy its
whole prompt, and send it in a working **local** Codex chat. Codex downloads the
project and prepares dependencies. You do not have to clone it yourself.

If authentication is needed, Codex should open a local interactive login terminal.
If it cannot open one, it should supply one complete command including your actual
checkout path. Open macOS Terminal, paste that command, and press Return.

Only in that local login prompt, paste the key from step 4 and press Return.
Input may be hidden. If a provider choice appears, select **OpenCode Zen**.
GitHub/Google were website login methods; this selection is the model provider.

After login succeeds, return to the original Codex chat and say:
**“Local login is complete. Continue installation and verification.”** Do not send
the key, and do not start a new installation conversation.

## 7. Verify and select the model

Codex should report actual text/file checks, plus images if you selected Muse.
After they pass, fully quit/reopen Codex and select **Big Pickle (OpenCode Native
Bridge)** or the optional **Muse Spark 1.3 Contributor Free (OpenCode Native Bridge)**.

An optional upstream check in OpenCode's own terminal UI is `/connect` →
**OpenCode Zen** → enter key, then `/models` → exact model → “Reply OK”. You may
install OpenCode from its [official download page](https://opencode.ai/download)
for this check, but a separate desktop installation is not required by the prompt.

## When stuck

| What you see | Next action |
| --- | --- |
| No key | Correct workspace → API Keys → Create API Key, or use the new-user Copy Key shortcut. |
| 401 / Invalid API key | Copy the complete key using the website button and enter it in local login again. |
| 403 / country unavailable | Check model/region eligibility. Reinstallation, payment or changing keys is not a guaranteed remedy. |
| 429 / quota / rate limit | Check Usage/Billing and the provider's reset guidance; stop retries. |
| Model visible but tasks fail | Use the README diagnostic prompt with the error text, without credentials. |

Our 2026-09-30 clean-credential probe passed Big Pickle and received a country
restriction for Muse. That observation does not establish every user's eligibility.

Existing Go users can log in at [Go](https://opencode.ai/go), retain their current
subscription, and select **OpenCode Go** in `/connect`, then `/models`. The bridge
prompt does not install the entire Go catalog. Other provider keys belong under
their own provider in `/connect` and use that provider's permissions and quota.

## Sources and scope

[Zen documentation](https://opencode.ai/docs/zen/),
[local authentication](https://opencode.ai/docs/cli/#auth), and
[Go documentation](https://opencode.ai/docs/go/). Read the Zen privacy section for
the free/contributor models' data-use terms.

Labels and paths were checked on 2026-09-30 against official public source.
We did not complete a signed-in browser walkthrough or create an account/key in
this revision. See [the exact source references](onboarding-sources.md).
