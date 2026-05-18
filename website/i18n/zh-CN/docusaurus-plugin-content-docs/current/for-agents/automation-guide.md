---
title: 自动化指南
sidebar_position: 2
description: "AI 代理和自动化系统端到端操作 Otto 的手册。涵盖安装、扩展交接、配对、控制器注册、ACL 批准和命令执行。"
keywords:
  - 自动化指南
  - AI 代理
  - 端到端自动化
  - 控制器自动化
  - 代理手册
---

# 自动化指南

这是 AI 代理和自动化系统以编程方式操作 Otto 的端到端手册。开始前请先查看[For Agents](./index.md)了解约束和决策流程。

## 前置条件

- Node.js 18+ 和 npm
- 已安装 Google Chrome
- 中继、浏览器节点和控制器之间的网络连通性

## 步骤 1：安装和设置

```bash
npm install -g @telepat/otto
otto setup --relay-url http://localhost:8787 --non-interactive
```

解析 JSON 输出中的：
- `daemonStatus`：`started` 或 `already_running`
- `extensionPath`：解压后扩展的路径
- `extensionVersion`：已安装版本

## 步骤 2：扩展交接

`otto setup` 提供解压后的扩展路径。向人工呈现以下指引：

1. 在 Chrome 中打开 `chrome://extensions`。
2. 启用**开发者模式**（右上角开关）。
3. 点击**加载已解压的扩展程序**并选择 setup 输出中的扩展路径。
4. 打开扩展弹窗。
5. 将中继 URL 设置为 `http://localhost:8787`（或你的中继 URL）。

对于远程中继部署，中继端点必须同时可从浏览器节点和控制器访问。远程流量使用 `https://` / `wss://`。

## 步骤 3：配对

```bash
# 为节点生成授权码
otto authcode

# 用户在扩展弹窗中输入码后批准它：
otto pair <code>
```

如果用户在扩展弹窗中找不到配对码输入字段，引导他们到扩展的 **Options** → **Pairing**。

## 步骤 4：注册控制器并认证

```bash
otto client register --name "agent-worker" --description "Autonomous Otto controller" --json
otto client login --client-id <clientId>
```

密钥处理：
- 将返回的客户端密钥存储在环境变量或密钥链中。
- 绝不要打印到共享日志。
- 对外部控制器进行带外交接。

## 步骤 5：ACL 批准

如果命令返回 `acl_missing_node_grant`，用户必须授予访问权限：

1. 打开扩展弹窗。
2. 导航到**控制器访问**。
3. 批准该控制器客户端。

批准后，重试失败的命令。

## 步骤 6：验证全栈

```bash
otto commands list --json
```

成功响应确认中继、节点、控制器和 ACL 均处于运维状态。

## 步骤 7：执行命令

```bash
# 打开受管理标签页
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# 使用返回的 tabSessionId 运行站点命令
otto cmd --action command.run \
  --tab-session <tabSessionId> \
  --payload '{"site":"reddit.com","command":"getFeed"}'

# 使用 otto test 运行支持流的命令
otto test reddit.com getChatMessages --stream-follow-ms 30000 --json
```

## 处理 `manual_login_required`

当命令返回 `manual_login_required` 时：

1. 告知人工：站点需要登录才能运行此命令。
2. 要求他们在打开的浏览器标签页中登录站点。
3. 确认后，使用相同的 `--tab-session` 重试命令。

不要尝试自动化凭据输入。此行为是有意的且不可协商。

## 关联故障

每个命令响应包含一个 `requestId`。使用它来拉取关联日志：

```bash
otto logs list --request-id <requestId> --source all --latest 100 --json
```

针对扩展特定问题：

```bash
otto logs list --source node --latest 50 --json
```

实时调试：

```bash
otto logs follow --source all --json
```

## 多机器部署

当中继、浏览器节点和控制器在不同机器上时：

- 中继端点必须同时可从节点和控制器网络路径访问。
- 在生产环境中配置 `OTTO_EXTENSION_ORIGIN` 以匹配扩展来源。
- 远程部署使用 `wss://` 和 `https://`。
- 防火墙规则必须允许中继端口上的 WebSocket 升级。

## 安全边界

- 绝不自动化凭据提交 — 始终使用显式的 `manual_login_required` 交接。
- 绝不在日志或输出中暴露 `OTTO_TOKEN_SECRET`、客户端密钥或节点令牌。
- 验证 ACL 授权由节点拥有；不要尝试直接注入 ACL 状态。
- 保持负载有界 — 不要无界循环或捕获无限流数据。

## 相关页面

- [For Agents](./index.md) — 约束、决策流程和故障处理参考。
- [MCP 服务器](./mcp-server.md) — MCP 服务器文档和工具列表。
- [代理安装](./agent-setup.md) — 向代理框架注册 Otto。
- [控制器实现指南](../guides/controller-implementation.md) — WebSocket 控制器集成。
- [用例](../guides/use-cases.md) — 常用自动化模式的可运行示例。
- [高级故障排查](../guides/troubleshooting-advanced.md) — 流和路由诊断。
