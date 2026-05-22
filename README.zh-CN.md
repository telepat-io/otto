<p align="center"><img src="./assets/avatar/otto-logo.webp" width="128" alt="Otto"></p>
<h1 align="center">Otto</h1>
<p align="center"><em>在真实浏览器标签页上自动化 Web 工作流，无需托管浏览器集群。</em></p>

<p align="center">
  <a href="https://docs.telepat.io/otto">📖 文档</a>
  · <a href="./README.md">🇺🇸 English</a>
  · <a href="./README.zh-CN.md">🇨🇳 简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/telepat-io/otto/actions/workflows/ci.yml"><img src="https://github.com/telepat-io/otto/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build"></a>
  <a href="https://codecov.io/gh/telepat-io/otto"><img src="https://codecov.io/gh/telepat-io/otto/graph/badge.svg" alt="Codecov"></a>
  <a href="https://www.npmjs.com/package/@telepat/otto"><img src="https://img.shields.io/npm/v/@telepat/otto" alt="npm"></a>
  <a href="https://github.com/telepat-io/otto/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License"></a>
</p>

Otto 是一个安全的远程浏览器自动化平台，让您通过 CLI 或脚本控制真实的浏览器标签页——无需浏览器集群，无基础设施开销。通过 WebSocket 向中继守护进程发送命令，中继将其路由到 Chrome 扩展，在真实标签页上执行操作。

专为需要真实浏览器上下文进行测试、监控和智能体驱动工作流的开发者和自动化团队打造，无需管理无头基础设施。

## 功能特性

- **真实浏览器标签页，而非无头集群** — 通过轻量级扩展节点在真实 Chrome 标签页上执行命令。无需 Docker，无需 Puppeteer 集群，无需云浏览器租赁。
- **远程 CLI 控制** — 从笔记本电脑向运行在任何地方的浏览器发送命令。中继负责路由和认证，控制器和节点无需在同一台主机上。
- **代码驱动浏览器。LLM 只负责决策。** — Otto 用确定性代码处理点击、输入、导航和 DOM 交互。您的智能体只为策略消耗 token，而非每次交互。
- **默认安全** — 令牌认证、重放保护、逐节点 ACL 授权和入口前日志脱敏。密钥存储在操作系统密钥链中。
- **实时调试** — 通过 `otto logs follow --source all` 按 `requestId` 流式传输日志。实时关联中继、控制器和节点事件。
- **网络拦截** — 订阅来自受管理浏览器标签页的 HTTP 流量。将响应流式传回进行检查、验证或数据提取。
- **站点范围的命令包** — 为任何域名编写自定义、可复用的命令，在扩展内运行。可版本化、可共享、可测试。
- **智能体和 CI 就绪** — 非交互式设置、`--json` 输出、MCP 服务器、流式测试工具和智能体运行时注册。

## 快速开始

环境要求：Node.js 20+、Chrome、npm。

1. 全局安装 CLI：

```bash
npm install -g @telepat/otto
```

2. 运行引导式初始化：

```bash
otto setup
```

3. 将解压后的扩展加载到 Chrome（`otto setup` 会打印确切路径）。

4. 注册控制器身份：

```bash
otto client register --name "my-laptop" --description "本地控制器"
otto client login
```

5. 验证全链路：

```bash
otto commands list
```

完整教程请查看[安装指南](https://docs.telepat.io/otto/installation)和[快速入门](https://docs.telepat.io/otto/quickstart)。

## 可用命令

可通过 `otto commands list --site <site>` 查看当前已连接节点上的实时命令面。

### 站点命令

| 站点 | 可用命令 |
|---|---|
| `reddit.com` | `getPosts`, `getUserInfo`, `sendChatMessage`, `getChatMessages`, `commentOnPost` |
| `linkedin.com` | `getPosts`, `commentOnPost` |
| `news.ycombinator.com` | `getFrontPage` |
| `google.com` | `getSearchResults` |

### 原语（通用）

| 分类 | 可用原语 |
|---|---|
| 标签页 | `open`, `close`, `navigate`, `query` |
| DOM 提取 | `extract_text`, `extract_markdown`, `extract_clean_html`, `extract_distilled_html`, `extract_html` |
| 页面 | `screenshot`（视口或完整页面） |
| 高级接口 | `otto extract-content [url]`（推荐用于 markdown/HTML 提取） |

### 支持的来源

Reddit 和 LinkedIn 的 `getPosts` 命令均支持可配置的来源：

| 站点 | 来源 | 说明 |
|---|---|---|
| `reddit.com` | `home`（默认） | 个性化主页信息流 |
| `reddit.com` | `subreddit` | 子版块列表（需要 `subreddit` 参数） |
| `reddit.com` | `user` | 用户发布的帖子（需要 `username` 参数） |
| `linkedin.com` | `home`（默认） | 个性化主页信息流 |
| `linkedin.com` | `search` | 关键词搜索结果（需要 `keyword` 参数，支持 `sort` 和 `t`） |

Reddit `getPosts` 在主页和子版块来源上支持 `sort`（`best`、`hot`、`new`、`top`、`rising`）和 `t`（`hour`、`day`、`week`、`month`、`year`、`all`）。LinkedIn `getPosts` 在搜索来源上支持 `sort`（`top`、`latest`）和 `t`（`day`、`week`、`month`）。

关于命令入参、行为说明与示例，请参阅[命令参考](https://docs.telepat.io/otto/commands)。

## 环境要求

- Node.js 20+
- npm 10+
- Chrome（最新稳定版）
- macOS、Linux 或 Windows

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

1. 控制器通过 WebSocket 向中继发送命令信封。
2. 中继进行身份验证、按操作范围授权，并根据 `targetNodeId` 进行路由。
3. 节点执行操作，返回终态 `result` 或 `error`。
4. 中继将终态结果转发回发起命令的控制器。

执行保证：

- 所有命令均需要 `targetNodeId`。
- 每个标签页内的执行是串行的；跨标签页的执行是并行的。
- 强制执行重放保护（`replayNonce` 加时间戳窗口）。
- 敏感字段在日志持久化和流传输前会被脱敏处理。

## 与 AI Agent 一起使用

Otto 专为无界面自动化和智能体驱动的工作流设计：

- **非交互式初始化** — `otto setup --non-interactive` 输出确定性 JSON，无需 TTY 提示。
- **机器可读输出** — 为大多数 CLI 命令追加 `--json`（`otto commands list`、`otto test`、`otto logs list`）以获得结构化输出。
- **编程接口** — 中继暴露 HTTP 和 WebSocket 端点，支持直接集成。消息模式请参阅[协议](https://docs.telepat.io/otto/protocol)文档。
- **实时日志流** — `otto logs follow --source all` 按 `requestId` 流式传输结构化事件，便于智能体实时调试。
- **Agent 文档** — [For Agents](https://docs.telepat.io/otto/for-agents) 提供自动化手册、命令开发指南和 curl 示例。

## 安全与信任

- 控制器认证使用客户端密钥令牌交换；密钥在 OS 钥匙串可用时自动保存。
- 节点端 ACL 授权要求控制器在路由命令前必须获得显式节点授权。
- 重放保护和时间戳窗口防止命令重放。
- 敏感字段在持久化和流式传输前被脱敏。
- Otto 永远不会自动提交凭据；用户需手动认证后重新运行。

如需报告安全问题，请通过仓库安全报告通道私下提交。

## 文档与支持

- [文档站点](https://docs.telepat.io/otto)
- [安装指南](https://docs.telepat.io/otto/installation)
- [快速入门](https://docs.telepat.io/otto/quickstart)
- [架构](https://docs.telepat.io/otto/overview)
- [协议](https://docs.telepat.io/otto/protocol)
- [CLI 参考](https://docs.telepat.io/otto/cli)
- [安全](https://docs.telepat.io/otto/security)
- [For Agents](https://docs.telepat.io/otto/for-agents)
- [仓库](https://github.com/telepat-io/otto)
- [npm 包](https://www.npmjs.com/package/@telepat/otto)

## 贡献

欢迎贡献。请参阅[开发指南](https://docs.telepat.io/otto/development)了解本地环境搭建、构建命令和测试工作流。

## 许可证

MIT。详见 [LICENSE](./LICENSE)。
