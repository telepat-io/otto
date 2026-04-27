# Otto

**�🇸 [English](README.md) | 🇨🇳 [简体中文](README.zh-CN.md)**

[![npm](https://img.shields.io/npm/v/@telepat/otto)](https://www.npmjs.com/package/@telepat/otto)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/telepat-io/otto/actions/workflows/ci.yml/badge.svg)](https://github.com/telepat-io/otto/actions/workflows/ci.yml)

安全、可调试的远程浏览器自动化方案 — 中继守护进程、Chrome 扩展节点与 CLI 控制器集于一体。

## 工作原理

```
控制器（otto CLI / 脚本）
        |  WebSocket（已认证）
        v
  中继守护进程  (:8787)
        |  WebSocket（已认证，节点）
        v
  扩展节点（Chrome）
        |  chrome.tabs / chrome.scripting
        v
  浏览器标签页（受管理，站点范围）
```

三个运行时组件：

- `@telepat/otto` — CLI 控制器
- `@telepat/otto-relay` — 中继守护进程
- `@telepat/otto-extension` — 浏览器节点（通过 WXT 构建的 Chrome 扩展）

## [架构](https://docs.telepat.io/otto/overview)

1. 控制器通过 WebSocket 向中继发送命令信封。
2. 中继进行身份验证、按操作范围授权，并根据 `targetNodeId` 进行路由。
3. 节点执行操作，返回终态 `result` 或 `error`。
4. 中继将终态结果转发回发起命令的控制器。

执行保证：

- 所有命令均需要 `targetNodeId`。
- 每个标签页内的执行是串行的；跨标签页的执行是并行的。
- 强制执行重放保护（`replayNonce` 加时间戳窗口）。
- 敏感字段在日志持久化和流传输前会被脱敏处理。

## 快速开始

> 📖 [安装指南](https://docs.telepat.io/otto/installation) · [快速入门](https://docs.telepat.io/otto/quickstart)

### 全局安装路径（终端用户）

1. 全局安装 Otto CLI：

```bash
npm install -g @telepat/otto
```

CLI 包含中继运行时依赖，因此守护进程命令（`otto start`、`otto stop`、`otto status`）无需单独安装中继。

2. 运行引导式初始化：

```bash
otto setup
```

初始化专注于快速启动要点：

- 扩展构件始终从 Otto 发布资产下载并进行校验和验证。
- 中继 URL 默认值可复用，无需每次完整配置控制器设置。
- 中继守护进程就绪检查已纳入初始化流程：需要时自动启动守护进程，若同端口已在运行则复用。
- 交互式初始化提示流程使用 Ink 与 `@inkjs/ui` 组件提供确认界面。

初始化会从 Otto 发布版本下载扩展 zip 文件，验证校验和，将其本地解压，并打印 Chrome `加载已解压扩展程序` 所需的确切路径。

若中继守护进程已在不同于所选初始化中继 URL 的端口上运行，初始化将失败并给出明确说明，指导停止并在目标端口重新启动。

初始化行为说明：

- 交互式 TTY `otto setup`：
  - 确保中继守护进程就绪；
  - 打印初始化摘要及 Chrome 加载已解压扩展程序说明；
  - 打印扩展构件来源和路径详情。
- 显式非交互式 `otto setup --non-interactive`（或非 TTY）：
  - 仅输出确定性 JSON；
  - 包含 `relayDaemon` 状态（`status`、`pid`、`port`、`logPath`、`startedAt`）；
  - 省略人类可读的 Chrome 操作说明。
- 守护进程就绪策略：
  - 未运行时启动守护进程；
  - 在匹配初始化中继 URL 端口上运行时复用守护进程；
  - 端口不匹配时初始化失败，以避免隐式端口漂移。

3. 将扩展加载到 Chrome：

```text
1) 打开 chrome://extensions
2) 开启开发者模式
3) 点击"加载已解压的扩展程序"
4) 选择 otto setup 打印的文件夹（包含 manifest.json）
```

4. 打开扩展选项，按需配置节点中继 URL：

```text
默认扩展中继 URL 为 ws://127.0.0.1:8787?role=node
```

5. 推荐：注册持久化控制器身份（客户端密钥认证）：

```bash
otto client register --name "my-laptop" --description "本地测试的持久化控制器"
otto client login
```

注意事项：

- `otto client register` 返回一次性客户端密钥，并在 OS 密钥链可用时将其存储。
- 若密钥链不可用，请设置 `OTTO_CONTROLLER_CLIENT_SECRET`（或传入 `--client-secret`）并重新运行 `otto client login`。
- 客户端密钥用于令牌交换（`otto client login`）；运行时命令使用 Bearer 令牌作用域加节点 ACL 授权。
- 新注册的控制器客户端须在扩展弹出窗口/选项中的"控制器访问"下被授予节点访问权限。

6. 配对控制器与节点（次级入门路径）：

```bash
otto authcode
otto pair <code>
```

7. 冒烟测试：

```bash
otto commands list
```

### Monorepo 开发路径

1. 安装依赖：

```bash
npm install
```

2. 构建所有工作区：

```bash
npm run build
```

3. 启动中继：

```bash
otto start
```

前台日志本地开发模式：

```bash
otto start --attached
```

在本地开发上下文中从源码运行 CLI：

```bash
npm run dev -- setup
```

参数透传支持任意 CLI 命令，例如：

```bash
npm run dev -- commands list
```

4. 配置 CLI：

```bash
node packages/cli/dist/index.js config --relay-url 'ws://127.0.0.1:8787?role=controller'
```

5. 启动扩展开发运行时：

```bash
npm run dev:ext
```

开发者本地加载路径（仅限开发）：

```bash
npm run --workspace @telepat/otto-extension build
```

然后打开 `chrome://extensions`，点击"加载已解压的扩展程序"，选择 `extension/output/chrome-mv3`。

6. 配对节点与控制器：

```bash
node packages/cli/dist/index.js authcode
node packages/cli/dist/index.js pair 123-456
```

7. 运行基础命令：

```bash
node packages/cli/dist/index.js cmd --action primitive.tab.query --node-id <nodeId>
```

8. 发现并运行命令：

```bash
node packages/cli/dist/index.js commands list
node packages/cli/dist/index.js test reddit.com getFeed
```

9. 读取中继日志：

```bash
node packages/cli/dist/index.js logs list --since 2026-04-03T00:00:00Z
node packages/cli/dist/index.js logs follow
```

## 安装与设置命令

完整 CLI 参考：[docs.telepat.io/otto/cli](https://docs.telepat.io/otto/cli)

- `otto start`
  - 未运行时以守护进程模式启动中继。
  - 若中继已在运行，打印现有 pid 和日志路径。

- `otto start --attached`
  - 以前台附加模式启动中继（开发用途，日志输出到当前终端）。

- `otto stop`
  - 停止运行中的中继守护进程。

- `otto status`
  - 显示中继守护进程是否在运行。
  - 若守护进程未运行，打印 `otto start` 作为建议的下一步命令。

- `otto setup`
  - 在 TTY 上默认为交互式向导。
  - 添加 `--non-interactive` 输出确定性 JSON。
  - 添加 `--yes` 无提示接受默认值。
  - 添加 `--force` 强制重新安装扩展构件（即使已缓存）。
  - 将中继 URL 规范化为控制器角色（`?role=controller`）。
  - 除非设置 `--force`，否则复用当前 CLI 版本的缓存扩展构件。

- `otto extension update`
  - 下载当前 CLI 版本的发布扩展构件并更新缓存的已解压文件。
  - 打印重新加载说明，以便浏览器节点使用更新后的扩展重新连接。

- `otto extension info`
  - 显示 `~/.otto/config.json` 中已安装扩展构件的元数据。

- `otto settings`
  - 打开控制器全局设置 TUI。
  - CLI 交互式 TUI 界面正在基于 Ink + `@inkjs/ui` 进行标准化，以获得更一致的操作体验。
  - 操作方式：上/下选择设置项，Enter 打开选择器选项，上/下选择选项，Enter 应用。
  - 按 `s` 保存；按 `q` 或 `Esc` 退出。
  - 设置更改通过选择器进行（TUI 内无自由文本输入）。

设置所有权边界：

- CLI 控制器设置存储在 `~/.otto/config.json`。
- 扩展节点设置存储在 `chrome.storage.*` 中，通过扩展选项进行配置。
- 扩展运行时不依赖 CLI 配置文件。

发布构件约定（供 setup 使用）：

- 发布基础 URL 默认值：`https://github.com/telepat-io/otto/releases/download`
- 标签段期望格式：`v<cli-version>`
- 期望 zip 构件：`otto-extension-<version>-chrome-mv3.zip`
- 期望校验和构件：`otto-extension-<version>-chrome-mv3.zip.sha256`
- 校验和文件可为 `sha256sum` 格式（`<hash> <filename>`）或 OpenSSL 格式（`SHA256(...) = <hash>`）

CI/CD 与发布渠道：

- Pull request 和 `main` 提交针对 CLI、中继、共享协议和扩展并行运行各包范围的质量门禁（`check`、`lint`、`build`、`test`（如存在））。
- 当 docs/site 路径发生变更时，文档站部署到 `main` 分支的 GitHub Pages。
- Release Please 管理 CLI、中继和协议包（来自 `packages/cli`、`packages/relay`、`packages/shared-protocol`）的关联版本升级。
- 发布标签：CLI 使用 `v<version>`，中继/协议使用组件前缀标签（`relay-v<version>`、`protocol-v<version>`）。
- CLI npm 发布仅在已发布的语义化版本（`v<version>`）上运行，并在发布前验证标签/包版本一致性。
- 扩展构件仅在语义化版本 CLI 发布（`v<version>`）时作为 `otto-extension-<version>-chrome-mv3.zip` 及校验和发布，以保持 `otto setup` 下载模式的兼容性。

所需仓库密钥：

- npm 发布无需密钥。发布工作流通过 GitHub Actions OIDC（`id-token: write`）使用 npm 可信发布，因此包发布在 npm 端授权，而非通过仓库令牌。

## [命令框架](https://docs.telepat.io/otto/commands)

命令模型：

- 站点范围的命令包位于 `extension/src/commands/<site>/`。
- 每个站点包提供内置命令 `checkLogin` 和 `gotoLogin`。
- 主要运行时操作为 `command.list`、`command.run` 和 `command.test`。
- 遗留别名 `command.reddit_feed` 仍受支持以兼容迁移。

命令元数据与验证：

- 命令可声明 `inputFields` 进行严格类型/必填字段验证。
- 命令可声明 `inputAtLeastOneOf` 用于条件性约定（例如 `username` 或 `roomId`）。
- 命令可声明 `preloadHost`；需要时运行时会在 `execute` 前自动导航至该主机。
- `otto test` 在 `command.list` 中可用时自动打开 `preloadHost`，然后运行 `command.test`（当不存在 test 钩子时回退到 `execute`）。

流式架构（当前）：

- 运行时监听器传输保持通用（`network.http_intercept`）。
- 站点模块自持流解析和回退策略（例如 `extension/src/commands/reddit.com/chat-stream.ts` 中的 Reddit Matrix sync 解析）。
- 命令测试钩子可返回携带命令自有适配器提示的 `stream.listeners`（`options.streamAdapter`、可选的 `options.selfUserId`）。
- 后台运行时在中继发送前应用适配器映射，控制器/CLI 接收共享域对象（`chat.message`、`chat.typing`、`chat.participant`、`chat.message_deleted`），而非原始站点特定载荷。

重复抑制模型：

- 传输层抑制：混合拦截在短暂的有界时间窗口内对两个 CDP 来源（`Network` 和 `Fetch`）观察到的等效重复响应更新进行抑制。
- 域层抑制：命令适配器在转发映射对象前对重放同步载荷中的重复语义事件进行去重。
- `otto test` 默认打印人类可读的流输出，便于跟踪命令事件；添加 `--json` 可查看完整的原始信封对象。

认证感知行为：

- 命令可在元数据中声明 `requiresAuth`。
- 在 `authMode=auto` 模式下，运行时检查登录状态，若需要则导航到登录页面。
- 自动化永远不会提交凭据；用户手动认证后重新运行。

## 验证命令

代码更新后运行：

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## 文档站点

Otto 文档在线地址：[docs.telepat.io/otto](https://docs.telepat.io/otto/)。站点使用位于 `website/` 的 Docusaurus，读取仓库根目录 `docs/` 中的规范内容。

本地运行：

```bash
npm run docs:start
```

构建并提供生产输出：

```bash
npm run docs:build
npm run docs:serve
```

部署默认值：

- `DOCS_URL=https://docs.telepat.io`
- `DOCS_BASE_URL=/otto/`
- `GITHUB_OWNER=telepat-io`
- `GITHUB_REPO=otto`

## 参考文档

- [架构](https://docs.telepat.io/otto/overview)
- [协议](https://docs.telepat.io/otto/protocol)
- [配对与认证](https://docs.telepat.io/otto/pairing-auth)
- [扩展运行时](https://docs.telepat.io/otto/extension-runtime)
- [命令](https://docs.telepat.io/otto/commands)
- [中继运维](https://docs.telepat.io/otto/relay-operations)
- [安全](https://docs.telepat.io/otto/security)
- [测试](https://docs.telepat.io/otto/testing)
- [CLI 参考](https://docs.telepat.io/otto/cli)
- [配置](https://docs.telepat.io/otto/configuration)
- [开发指南](https://docs.telepat.io/otto/development)
