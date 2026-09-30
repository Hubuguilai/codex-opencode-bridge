# Get access to OpenCode models

Checked against official documentation on 2026-09-30. Provider availability,
limits and billing can change independently of this bridge.

## Accounts and model access

OpenCode supports multiple providers. Follow the [official introduction](https://opencode.ai/docs/)
to install its interface and use `/connect`. For OpenCode services, sign in at
[OpenCode authentication](https://opencode.ai/auth). Enter a key only in the
provider's local login flow; never paste it into a Codex chat or this repository.
Other providers can be connected using their own credentials.

[Zen](https://opencode.ai/docs/zen/) is the OpenCode model service with usage-based
billing and a changing selection of free models. Its current table lists Big
Pickle and Muse Spark 1.3 Contributor Free as free. A catalog listing does not
prove that a particular account, region or external API route can use a model.
Our tests use the official OpenCode runtime, not unrestricted access to Zen's
external API.

[Go](https://opencode.ai/docs/go/) is an optional subscription provider. Subscribe
in the console, then use `/connect`, select **OpenCode Go**, and enter its key.
Use `/models` to inspect Go's models. Go and Go Plus have usage limits; an optional
console setting can draw from a Zen balance after included usage is exhausted.
Review that setting before enabling paid fallback. A Go subscription does not
make every model in OpenCode free, nor does it imply this bridge has tested it.

Bring-your-own-provider credentials are a third route. Those providers' prices,
permissions and quotas apply. This project's initial installation scope is Big
Pickle and Muse Spark 1.3 Contributor Free; other providers are not automatically
certified by appearing in the OpenCode model list.

To check access, select the exact provider/model in OpenCode and make a short
request. A successful response demonstrates access at that moment; it does not
certify Codex tools or images. Then run the bridge's model workflow checks.
For 401/403, check login, model eligibility and region. For 429, check the console
and retry only after the stated reset/backoff. Do not create new identities or
switch keys to bypass limits. If a model disappears, stop selecting it and check
the official catalog. This project supplies no shared accounts or keys.

## Runtime used by this bridge

The current bridge plugin targets official `@opencode/cli` **2.0.18**. The
public introductory installation guide may install a different release. The
bridge therefore provides a separate managed dependency command:

```sh
node bin/bridge.mjs install-runtime
```

It installs the pinned official npm package in this project's private runtime
directory, checks the version, and returns the executable path. Package versions
and integrity values are recorded in `runtime/package-lock.json`. It does not
replace a global OpenCode installation, edit Codex, start a service, or establish
model permissions. This is one installer component, not the complete desktop
installation. Set `OPENCODE_BIN` to the returned executable when using the
existing manual preparation flow.

This component was tested on macOS arm64. The package contains a macOS x64
runtime, but installation on x64 has not been tested. The managed installation
command rejects other operating systems for this release candidate.

## 中文说明

先按 [OpenCode 官方说明](https://opencode.ai/docs/) 登录自己的供应商。
在 OpenCode 中用 `/connect` 连接账号，用 `/models` 找到准确的供应商和模型，
再发送一条简短消息确认当前账号有权使用。密钥只填进本地登录流程，不要发到聊天中。

- **免费模型**：来自当前免费目录，仍可能有账号、地区、限流或下架限制。
- **Zen 付费模型**：按服务的计费规则使用；免费目录和付费目录需要区分。
- **Go 订阅**：在控制台订阅后，连接 OpenCode Go；订阅有额度，不代表全部模型无限使用。
- **自带供应商密钥**：使用该供应商的权限与额度，不自动获得其他供应商的模型。

本项目优先验证 Big Pickle 与 Muse Spark 1.3 Contributor Free。目录中存在、
OpenCode 能回答、Codex 能正确调用工具和处理图片，是三项不同的验证。

上面的 `install-runtime` 命令只安装项目独立管理的 OpenCode 2.0.18，
不会改动已有 OpenCode 或 Codex 配置。它已在 macOS arm64 的新目录中完成安装与
重复执行验证；完整桌面安装、升级和卸载流程仍在开发。
