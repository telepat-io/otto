---
title: 高级故障排查
sidebar_position: 8
description: "Otto 控制器、中继和扩展节点工作流的深度调试指南。错误到操作表、流诊断和逐步隔离流程。"
keywords:
  - 故障排查
  - 调试
  - 错误码
  - 流诊断
  - otto logs
---

# 高级故障排查

本指南涵盖跨控制器、中继和扩展节点工作流的深度调试。从核心工作流开始隔离故障层，然后使用错误到操作表解决问题。

## 核心调试工作流

1. **以新请求复现** — 避免调试过时状态。
2. **收集广泛日志** — 先使用 `--source all` 查看所有组件。
3. **按 `requestId` 隔离** — 使用一个请求 ID 作为主关联键。
4. **缩小故障层** — 认证、路由、执行、监听器生命周期或清理。

## 常用命令

| 目标 | 命令 |
|---|---|
| 实时跟踪所有来源 | `otto logs follow --source all` |
| 聚焦扩展端运行时 | `otto logs follow --source node` |
| 拉取有界节点证据 | `otto logs list --source node --latest 300` |
| 验证命令可见性 | `otto commands list` |
| 以机器可读输出复现 | `otto test <site> <command> --json` |
| 打开新的受管理标签页 | `otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}'` |

## 错误到操作表

| 错误 | 症状 | 可能原因 | 解决方案 |
|---|---|---|---|
| `manual_login_required` | 命令暂停，标签页保持打开 | 站点缺少浏览器会话 | 在浏览器标签页中手动登录，然后重新运行命令 |
| `site_mismatch` | 命令在执行前被拒绝 | 标签页 URL 与命令站点不匹配 | 导航到正确的主机或通过 `primitive.tab.open` 重新打开标签页 |
| `tab_url_not_ready` | 命令在启动时被拒绝 | URL 尚未提交到 Chrome 标签页 | 短暂延迟后重试；使用 `primitive.tab.open` 创建新会话 |
| `acl_missing_node_grant` | 针对节点的命令被阻止 | 控制器客户端缺少节点 ACL 授权 | 从节点 ACL API 或通过 `otto client` 流程授予访问权限 |
| `tab_busy` / `tab_locked` | 命令等待锁超时 | 另一个命令持有标签页锁 | 以有界退避重试，或配置 `wait_with_timeout` 等待策略 |
| `invalid_access_token` | 每个命令的认证都失败 | 访问令牌已过期 | 运行 `otto client login` 刷新令牌 |
| `forbidden_action` | 命令在中继处被拒绝 | 控制器令牌缺少所需作用域 | 重新注册或使用更宽作用域的令牌刷新 |

:::tip
对任何故障，首先从错误信封中捕获 `requestId`。然后使用 `otto logs list --request-id <id> --source all` 查看跨组件的完整时间线。
:::

## 流诊断

对流故障，遵循此隔离序列：

1. 确认 `command.test` 在结果信封中返回了 `stream.listeners`。
2. 验证订阅命令返回了终端结果（非错误）。
3. 确认 `listener_update` 事件与**订阅** `requestId`（而非原始命令 `requestId`）关联。
4. 验证拆除是显式的：流命令上的 `listener.unsubscribe` 或 `command_cancel`。

原始网络捕获验证：

```bash
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site example.com \
  --pattern 'https://api.example.com/*' \
  --mode network
```

预期：流式 `listener_update` 事件。如果没有任何输出，则模式、主机或模式可能配置错误。

## 预防措施

- 保持每个命令上的 `targetNodeId` 显式指定。
- 在调试执行故障之前使用 `otto commands list` — 确认认证和路由健康。
- 为长期运行的控制器会话主动刷新令牌。
- 对无人值守的流测试使用 `--stream-follow-ms` 加超时，而不是无限期地保持会话打开。

## 下一步

- [控制器故障排查决策树](./controller-troubleshooting-decision-tree.md) — 逐步决策路径。
- [requestId 关联手册](./requestid-correlation-runbook.md) — 跨组件追踪一个请求。
- [错误码](../error-codes.md) — 完整的含可重试性的错误码参考。
