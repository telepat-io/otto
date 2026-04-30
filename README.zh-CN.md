<p align="center"><img src="./assets/avatar/otto-logo.webp" width="128" alt="Otto"></p>
<h1 align="center">Otto</h1>
<p align="center"><em>驱动网络的手。</em></p>

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

Otto 是安全、可调试的远程浏览器自动化方案。控制器通过 WebSocket 向中继守护进程发送命令，后者将其路由到 Chrome 扩展节点，在真实标签页上执行操作。

## 它能解决什么问题

Otto 让你无需自建浏览器集群即可自动化和测试 Web 工作流。

- 从本地 CLI 或脚本在真实浏览器标签页上运行命令。
- 从一次性任务到定时监控，使用同一套接口进行扩展。
- 通过实时日志和重放保护执行进行调试。
- 为任何域名构建站点范围的命令包，实现可复用的自动化。

典型场景包括端到端测试、社交监听、内容审核，以及任何需要真实浏览器上下文的工作流。

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
