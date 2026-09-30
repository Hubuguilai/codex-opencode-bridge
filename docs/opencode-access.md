# 先在 OpenCode 取得模型 / Get model access

核对日期：2026-09-30。先选下面一条路径；不用三条都做。

## A. 先免费试用 Big Pickle（推荐）

1. 不必先订阅。回到[中文首页第二步](README.zh-CN.md#第二步把这一整段复制给-codex)，
   把完整 Prompt 发给 Codex，它会准备官方 OpenCode 运行时并试用 Big Pickle。
2. 如果验证通过，你已经取得当前可用的访问，不需要再生成 Key。
3. 如果提示登录或权限不足，再走 B；如果是限流，等待恢复，不要重复安装。

我们在没有继承账号、Key、配置的独立环境里实际调用 Big Pickle 成功。
这是 2026-09-30 的一次访问测试，不代表永久免费、无限额度或所有地区可用。
[测试记录](receipts/onboarding-anonymous-access.json)。

如果你想**先在 OpenCode 自己的界面里确认模型**：

1. 打开 [OpenCode 下载页](https://opencode.ai/download)，在 **OpenCode Desktop**
   下选择与你的 Mac 对应的下载，安装后打开。已有 OpenCode 可跳过。
2. 新建一个本地会话，在模型选择器中搜索 **Big Pickle** 并选择。桌面版本的具体
   控件位置可能变化；终端界面可输入 `/models` 搜索同名模型。
3. 发送“只回复 OK”。有正常回答即可回到 Codex 粘贴安装 Prompt。看得到模型但
   回答报错不算获得权限。

不想单独安装 OpenCode 桌面版也没关系：桥接安装器会准备它需要的独立官方运行时。

## B. 我需要登录 Zen，或我想用 Muse

1. 打开 [OpenCode Zen](https://opencode.ai/zen)，点 **Get started with Zen** 或
   **Login**。使用页面提供的方式注册/登录。
2. 按控制台指引取得你自己的 **API Key**。官方开户说明包含账单设置；若要求付款，
   请先判断你是否需要付费服务，不要把免费目录理解为全部开户流程都免费。
   控制台的账号内页面没有在本次测试中登录复核，按钮名称和账单要求以你看到的为准。
3. 已有 OpenCode 终端界面：输入 `/connect` → 选择 **OpenCode Zen** → 在它的
   输入框粘贴 Key。没有终端环境：先把首页 Prompt 给 Codex；它需要登录时会提供
   一个本地终端入口，你只在该终端输入 Key，完成后回到原对话说“登录完成，请继续”。
4. 用 `/models` 选择准确的 **Muse Spark 1.3 Contributor Free**，发一句测试消息。
   成功后，在安装 Prompt 末尾加上首页给出的 Muse 补充句。

**Muse 特别说明：** 当前官方价格表列为免费，但本次无登录测试返回
`This model is not available in your country.`（403）。这不是缺 Key 的证明；
登录、充值或购买 Go 都不能保证解决。如果你的账号或地区无法使用，就先安装 Big Pickle。
不要选择名称相近的付费 `Muse Spark 1.3` 后以为仍在免费路线。

官方来源：[Zen 设置及价格](https://opencode.ai/docs/zen/)、
[本地认证方式](https://opencode.ai/docs/cli/#auth)。
Big Pickle 免费期的数据可能用于改进模型；Muse Contributor 条款涉及训练用途，
使用前阅读 [Zen 隐私说明](https://opencode.ai/docs/zen/#privacy)。

## C. 我已经买了 Go，或者有其他供应商的 Key

**Go 订阅：** 打开 [OpenCode Go](https://opencode.ai/go)，通过 **Login** 或
**Subscribe to Go** 进入账号。已有订阅不要重复购买。取得账号提供的 Key 后，
在 OpenCode 终端输入 `/connect`，这次选 **OpenCode Go**，再通过 `/models`
选择订阅提供的模型并测试。控制台可查看用量；是否启用余额后备由你决定，安装器不会替你开启。
[官方 Go 指引](https://opencode.ai/docs/go/)。

**其他供应商：** `/connect` 中选择实际供应商，按其官方登录方式连接，再选择该
供应商下面的模型。使用的是该供应商的额度，不会自动获得 Zen 或 Go 的权限。
[官方供应商说明](https://opencode.ai/docs/providers/)。

**本项目的一次 Prompt 安装当前只配置 Big Pickle 和可选 Muse 免费路线。**
有 Go 或其他供应商的权限不等于这些模型已经被本项目适配；不要把订阅里的全部模型
一键加进来，也不要把 Go Key 当成保证能访问 Zen 免费模型的凭据。

## English quick guide

- **Free first:** Big Pickle answered with a clean credential-free OpenCode home
  in our dated test. Paste the README prompt to install and check your access;
  buying Go is not required for this tested route.
- **Zen login:** open [Zen](https://opencode.ai/zen), choose Get started/Login,
  complete the account's requirements, and obtain your own key. Use `/connect`
  → OpenCode Zen in the local terminal UI. Billing requirements depend on the
  console; we did not inspect a signed-in console in this revision.
- **Muse:** select the exact Contributor Free model with `/models` and test it
  first. Our anonymous request was country-denied, so login/payment is not a
  guaranteed fix. Ask Codex to add Muse only once your route works.
- **Go:** sign in at [Go](https://opencode.ai/go), use your existing subscription
  or deliberately subscribe, then `/connect` → OpenCode Go and `/models`. This
  does not add every Go model to the bridge's tested onboarding scope.
- **Your own provider:** connect that provider with its own credentials; its
  permissions and quota apply. Never send credentials through a Codex chat.

A working OpenCode reply proves access at that moment. The bridge's subsequent
Codex text/file/image checks validate the integration separately.
