---
title: 错误码
sidebar_position: 1
description: "Otto 错误码的权威目录，包含可重试性分类和修复措施。涵盖认证、验证、路由、锁/超时以及站点特定错误。"
keywords:
  - 错误码
  - 错误参考
  - 故障排查
  - 重试策略
  - acl 错误
---

# 错误码

本页是 Otto 的权威错误码参考。每个错误码在 `error` 信封负载中发送。使用**可重试**列判断自动化重试是否安全；使用**操作**列进行即时修复。

## 认证错误

| 码 | 可重试 | 操作 |
|---|---|---|
| `missing_access_token` | 否 | 在发送命令之前获取或配对令牌 |
| `invalid_access_token` | 是 | 使用 `otto client login` 刷新令牌，然后重连 |
| `role_mismatch` | 否 | 使用具有正确角色的令牌访问此端点 |
| `unauthenticated` | 否 | 发送命令前完成 `hello` → `auth` 握手 |
| `acl_missing_node_grant` | 否 | 在扩展弹窗中或通过 `POST /api/controller/access` 授予控制器对节点的访问权限 |

## 验证错误

| 码 | 可重试 | 操作 |
|---|---|---|
| `missing_target_node` | 否 | 在每个命令信封中设置 `targetNodeId` |
| `missing_tab_session` | 否 | 为标签页作用域命令提供 `tabSessionId` |
| `invalid_command_input_type` | 否 | 将字段类型修改为声明的 `inputFields` 模式中的定义 |
| `missing_command_input` | 否 | 提供 `inputFields` 中声明的所有必填字段 |
| `missing_command_input_one_of` | 否 | 至少提供 `inputAtLeastOneOf` 列表中的一项字段 |
| `unexpected_command_input` | 否 | 移除 `inputFields` 中未声明的键 |

## 路由与执行错误

| 码 | 可重试 | 操作 |
|---|---|---|
| `node_offline` | 是 | 重新解析已连接节点并重试 |
| `site_mismatch` | 否 | 将标签页导航到正确的站点，或使用 `primitive.tab.open` 重新打开 |
| `tab_url_not_ready` | 是 | 短暂延迟后重试；URL 尚未提交到 Chrome 标签页 |
| `preload_host_mismatch` | 否 | 验证 `preloadHost` 路径；检查站点重定向或拦截页 |
| `manual_login_required` | 否 | 在浏览器标签页中手动登录，然后重新运行命令 |
| `unknown_site` | 否 | 使用 `otto commands list` 检查支持的站点 |
| `unknown_command` | 否 | 使用 `otto commands list --site <site>` 检查可用命令 |
| `unknown_tab_session` | 否 | 使用 `primitive.tab.open` 重新打开受管理标签页 |

## 锁与超时错误

| 码 | 可重试 | 操作 |
|---|---|---|
| `tab_busy` | 是 | 使用有界退避重试，或切换到 `waitPolicy: wait_with_timeout` |
| `tab_locked` | 是 | 锁租约过期后重试 |
| `queue_wait_timed_out` | 是 | 增加 `timeoutMs`，或减少并发命令竞争 |
| `command_timed_out` | 是 | 增加 `timeoutMs`，或缩小命令操作范围 |
| `tab_queue_limit_exceeded` | 是 | 减少此标签页会话上的并发命令 |
| `rate_limited` | 是 | 降低命令吞吐率；检查中继 `OTTO_RATE_LIMIT_PER_MIN` 设置 |
| `replay_rejected` | 否 | 生成新的 `replayNonce` 和更新的 `timestamp` |
| `timestamp_out_of_window` | 否 | 同步系统时钟；`timestamp` 必须在 `OTTO_REPLAY_WINDOW_MS` 的中继时间范围内 |
| `node_disconnected` | 是 | 中继在节点掉线时发出此信息；重连后重试 |

## 站点特定错误 (Reddit)

| 码 | 可重试 | 操作 |
|---|---|---|
| `reddit_user_not_found` | 否 | 验证目标用户名或用户 ID |
| `reddit_user_unmessageable` | 否 | 选择其他接收者 |
| `reddit_rate_limited` | 是 | 退避后重试 |
| `reddit_matrix_token_missing` | 否 | 重新认证 Reddit 页面会话 |
| `reddit_chat_send_unconfirmed` | 否 | 验证发送状态并重新运行命令 |

## 下一步

- [高级故障排查](./guides/troubleshooting-advanced.md) — 错误到操作的流程。
- [控制器故障排查决策树](./guides/controller-troubleshooting-decision-tree.md) — 控制器故障的隔离路径。
- [协议参考](./protocol.md) — 错误信封形状。
