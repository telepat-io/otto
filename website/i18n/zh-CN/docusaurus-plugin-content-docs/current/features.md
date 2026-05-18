---
slug: /features
title: "真实浏览器。远程控制。零基础设施。"
description: "Otto 能为开发者、自动化团队和 AI 智能体做什么。"
keywords: [otto, 功能, 浏览器自动化, 远程浏览器, chrome 扩展, cli]
sidebar_label: 功能
sidebar_position: 1
---

# 真实浏览器。远程控制。零基础设施。

Otto 是一个安全的远程浏览器自动化平台，让您通过 CLI 和脚本控制真实的 Chrome 标签页——无需浏览器集群，无需云租赁，无需无头猜测。

专为需要真实浏览器上下文进行测试、监控和智能体驱动工作流的开发者和自动化团队打造，无需管理基础设施。

---

## 真实浏览器标签页，而非无头集群

通过轻量级扩展节点在真实的 Chrome 标签页上执行命令。无需拉取 Docker 镜像。无需管理 Puppeteer 集群。无需云浏览器订阅。一个扩展，一个中继，完全控制。

```bash
otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}'
otto cmd --action primitive.tab.screenshot --tab-session <id>
```

---

## 远程 CLI 控制

从您的笔记本电脑向运行在任何地方的浏览器发送命令——同一台机器、办公网络或远程服务器。中继守护进程负责路由和身份验证，因此您的控制器和浏览器节点无需在同一台主机上。

```bash
otto start          # 启动中继守护进程
otto client login   # 验证控制器身份
otto commands list  # 验证连接
```

---

## 代码驱动浏览器。LLM 只负责决策。

大多数浏览器自动化工具让 LLM 推理每一次点击、每一个表单字段、每一个 DOM 元素——将 token 消耗在*如何做*而非*做什么*上。Otto 用确定性代码处理点击、输入、导航和 DOM 交互。您的智能体只为策略和决策付费。

无需在按钮坐标上浪费上下文窗口。不会对页面状态产生幻觉。只有精准的执行。

---

## 默认安全

- **基于令牌的身份验证** — 控制器用客户端密钥换取访问和刷新令牌
- **逐节点 ACL 授权** — 节点所有者决定哪些控制器可以路由命令
- **重放保护** — 每个命令包含 nonce 和时间戳窗口
- **入口前日志脱敏** — 敏感字段在持久化或流传输前被剥离
- **操作系统密钥链存储** — 客户端密钥通过操作系统凭据管理器安全存储

Otto 从不会自动提交凭据。用户手动认证后重新运行。

---

## 实时调试

通过 `requestId` 关联实时流式传输结构化日志。在一个终端中追踪命令从控制器 → 中继 → 节点的完整路径。

```bash
otto logs follow --source all
otto logs list --source node --latest 50
```

每个事件都标记了来源（`relay`、`controller`、`node`）并通过 `requestId` 关联。无需 grep 猜测即可找到根本原因。

---

## 网络拦截

订阅来自受管理浏览器标签页的 HTTP 流量。将响应流式传回控制器进行检查、验证或数据提取。

```bash
otto listener subscribe-network \
  --tab-session <id> \
  --site reddit.com \
  --request-host matrix.redditspace.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network
```

用于 API 监控、数据抓取、集成测试，或在调试时验证网络行为。

---

## 站点范围的命令包

为任何域名编写自定义、可复用的命令。命令在扩展运行时内部执行，并且是按站点划分的，因此 Reddit 的 `getChatMessages` 和 LinkedIn 的 `getChatMessages` 是独立、可预测且可测试的。

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
otto test ... --stream-probe  # 强制立即发送流量以加快迭代
```

版本化管理您的命令。跨控制器共享。构建站点自动化原语库。

---

## 智能体和 CI 就绪

- **非交互式设置** — `otto setup --non-interactive` 输出确定性 JSON
- **一切皆可机器读取** — `--json` 标志适用于 commands、list、logs 和 test
- **MCP 服务器** — `otto mcp` 通过 stdio 为 Claude Code、ChatGPT、Gemini 或任何 MCP 主机暴露 Otto 工具
- **流式测试工具** — `otto test` 配合 `--stream-follow-ms` 进行自主验证
- **智能体运行时注册** — `otto agent install <runtime>` 支持主流平台

---

## 准备好自动化了吗？

[开始使用 →](./installation.md)

或者直接跳转到 [快速开始](./quickstart.md) 和 [CLI 参考](./cli/index.md)。
