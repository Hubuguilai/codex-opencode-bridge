# 从零注册 OpenCode、取得 Key，再交给 Codex 安装

你只需要浏览器和已经能正常使用的 Codex。**不需要先装 OpenCode 桌面版，也不需要先买 Go。**
下面先讲账号路径；只想先试 Big Pickle 的用户，可以直接使用首页的安装 Prompt，
让 Codex 先测试免费访问，需要登录时再回来完成本页。

[返回中文安装首页](README.zh-CN.md) · [English walkthrough](opencode-access.en.md)

## 1. 打开正确的网站

打开 **[OpenCode Zen 官网](https://opencode.ai/zen)**，点击 **Get started with Zen**
或 **Login**。也可以直接打开 **[登录入口](https://opencode.ai/auth)**。

**做到这里应该看到：** 登录选择页面，或者已经登录后的 OpenCode 控制台。
已经进入控制台的用户直接跳到第 3 步。不要误点 **Subscribe to Go**；那是购买另一种服务。

## 2. 用自己的 GitHub 或 Google 账号登录

在登录页面选择你已有的 **GitHub** 或 **Google** 账号，按该账号的登录提示继续。
如果跳到账号授权页面，确认目标是 OpenCode，再由你本人完成授权。
首次使用也从这个入口进入，不必另外找一个邮箱密码注册表单。

**做到这里应该看到：** 浏览器返回 OpenCode 控制台，而不是停留在 GitHub/Google 登录页。
如果提示邮箱未验证，先去所选账号完成邮箱验证，再重新打开登录入口。
不需要为了下载本桥接项目注册 GitHub；这里的 GitHub 是 OpenCode 提供的一种登录方式，
也可以选择 Google。

## 3. 选中你的工作区

工作区就是存放模型权限、Key 和用量的空间。已有默认工作区就直接使用，不用再创建一个。
如果需要选择，点击 **Select workspace**，选择你自己的工作区。
需要新建时，点 **+ Create New Workspace**，在 **Enter workspace name** 中填写一个
便于识别的名字，例如 `Personal`，然后点 **Create**。

**做到这里应该看到：** 控制台有 **Zen、Go、Usage、API Keys、Billing、Settings** 等入口。
后续创建 Key 和检查额度都留在同一个工作区，不要中途切换。

## 4. 取得你自己的 API Key

新用户首页如果已经显示 **Copy Key**，可以直接点击，看到 **Copied!** 就表示已复制。
否则按下面这条路径操作：

1. 点击 **API Keys**。
2. 点击 **Create API Key**。
3. 在 **Enter key name** 输入 `Codex Bridge`。这是备注名称，不是让你自己编一个 Key。
4. 点击 **Create**。
5. 在列表中找到 **Codex Bridge** 这一行，点击 Key 旁的复制图标，提示文字为 **Copy API key**。

**做到这里应该看到：** 新 Key 对应的列表行；点击后复制图标会短暂变成勾。
列表里通常是掩码显示，**不要手动抄写带星号的字符串**，要点击复制按钮。
可以存入自己的密码管理器。不要把 Key 发给 Codex、贴到 GitHub 或截进教程图片。
如果团队工作区中某个 Key 不能复制，创建属于自己的 Key；不要索取同事的 Key。

## 5. 看到了充值或订阅页面，该怎么选？

**注册成功、拿到 Key、某个模型实际可用，是三件不同的事。** 按你要做的事情选择：

| 你看到的内容或你的需求 | 现在怎么做 |
| --- | --- |
| 只想先试 Big Pickle | 先回首页交给 Codex 测试；我们记录过无 Key 成功的访问，不把充值写成必需步骤。 |
| `Enable billing`、添加余额、绑定支付方式 | 这是 Zen 付费服务的账单流程。只有你决定使用相关付费服务时才完成；安装 Prompt 不会替你付款。 |
| `Subscribe to Go` / `Go Plus` | 这是可选订阅，不是注册账号的必经步骤。本教程默认安装无需先购买它。 |
| 需要 Muse Contributor Free | 确认准确名称包含 `Contributor Free`，并实际测试权限；名称相近的 Muse 模型可能收费。 |
| 已有 Go 订阅 | 不要重复购买；查看本页后面的 Go 说明。 |

如果网站确实要求完成账单设置才能使用你选择的账号路线，就由你决定是否继续；
不要把“官方表格里列为 Free”理解成所有账号、地区及接入方式都必然能用。

## 6. 回到 Codex，只粘贴安装 Prompt

打开[中文首页第二步](README.zh-CN.md#第二步把这一整段复制给-codex)，复制完整 Prompt，
发到一个能正常工作的 **Codex 本地对话**。不需要先克隆仓库或安装 OpenCode。

Codex 会下载项目、准备依赖，并在需要认证时打开本地终端登录入口。
如果当前环境不能自动打开，它应给你**包含完整项目路径的一条可复制命令**；
你打开 Mac 的“终端”，粘贴那一整条命令并回车，不用自己找目录。

**只有在这个本地登录提示里，才粘贴第 4 步取得的 Key 并回车。**
粘贴后终端可能不显示完整字符，这是正常现象。若出现供应商选择，选择 **OpenCode Zen**。
这里不要选 Google/GitHub：那是前面的网页登录方式；这里选择的是模型服务。

**做到这里应该看到：** 本地登录流程成功结束，没有认证失败提示。
然后回到原来的 Codex 对话，发送 **“本地登录已完成，请继续安装和验证。”**
不需要重新复制整段安装 Prompt，也不要把 Key 一起发过去。

## 7. 确认模型真的可用

让 Codex 完成安装后的自动验证：Big Pickle 要有文字和文件操作结果；选择 Muse 时，
还要检查图片。全部通过后，完全退出并重新打开 Codex，在模型菜单选择：

- **Big Pickle (OpenCode Native Bridge)**
- **Muse Spark 1.3 Contributor Free (OpenCode Native Bridge)**（仅当你选择安装）

若想在 OpenCode 自己的界面先验证：安装[官方 OpenCode](https://opencode.ai/download)，
在终端界面输入 `/connect` → **OpenCode Zen** → 输入 Key，然后 `/models` → 搜索
准确模型名称 → 发送“只回复 OK”。这是一条可选检查路径，不是使用安装 Prompt 的前置要求。

## 卡住时，只做对应的下一步

| 现象 | 下一步 |
| --- | --- |
| 登录后仍回到登录页 | 重开登录入口，使用刚才同一种账号登录；邮箱未验证时先完成验证。 |
| 找不到 Key | 回到正确工作区 → **API Keys** → **Create API Key**。首页已有 **Copy Key** 也可直接复制。 |
| `401` / `Invalid API key` | 重新点击网站的复制按钮，在本地登录窗口填写完整 Key；不要复制掩码或把名称当成 Key。 |
| `403` / `not available in your country` | 检查模型或地区权限。重装桥接、换 Key、充值都不保证解决，先保留可用的 Big Pickle。 |
| `429` / quota / rate limit | 查看控制台 **Usage / Billing** 和服务给出的恢复时间，暂停重试。 |
| 菜单有模型，但不能完成任务 | 把错误文字交给首页的诊断 Prompt；模型出现在菜单不等于权限和工具已经验证成功。 |

本项目 2026-09-30 的独立无凭据测试中，Big Pickle 成功，Muse 返回国家限制 403。
这是一份当时的测试记录，不代表所有用户所在地区都会得到相同结果。

## 已买 Go 或自带其他供应商的 Key

Go 用户打开 [Go 官网](https://opencode.ai/go) 的 **Login** 进入原账号，使用已有订阅。
在 OpenCode 终端的 `/connect` 中选 **OpenCode Go**，再用 `/models` 查看订阅提供的模型。
Zen 和 Go 是不同的服务选项；同一账号里取得 Key，也不代表自动拥有全部模型的权限。
本项目首页的安装范围仍是 Big Pickle 和可选 Muse 免费路线，不会把整个订阅目录都加进 Codex。

其他供应商的 Key 应在 `/connect` 中选择对应供应商，使用其额度和权限。
不要把“模型能在 OpenCode 中使用”当作“已通过本项目适配验证”。

## 核对依据

按钮名称与路径于 **2026-09-30** 对照官方文档及 OpenCode 公开源码核对。
浏览器工具未能打开本次登录流程，因此这里不提供伪装成实测的账号截图，也不声称已完成
注册、付费或登录后的全流程测试。部署页面如果变化，以页面实际显示为准。

- [官方 Zen 设置、价格与隐私条款](https://opencode.ai/docs/zen/)：Big Pickle 免费期和 Muse Contributor 的数据使用条款需要阅读。
- [官方本地认证说明](https://opencode.ai/docs/cli/#auth) · [Go 设置说明](https://opencode.ai/docs/go/)。
- [本次源码核对记录](onboarding-sources.md)：GitHub/Google 登录、工作区、创建与复制 Key 的具体依据。
- [无凭据访问测试记录](receipts/onboarding-anonymous-access.json)。
