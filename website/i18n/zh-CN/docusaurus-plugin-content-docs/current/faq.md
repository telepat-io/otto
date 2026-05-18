---
title: 常见问题
sidebar_position: 12
description: "Otto 常见问题解答，按类别整理。涵盖安装、认证、错误、调试和扩展管理。"
keywords:
  - 常见问题
  - 故障排查
  - 安装问题
  - 认证错误
  - otto 命令
---

# 常见问题

## 安装

**我需要单独安装 `@telepat/otto-relay` 吗？**

不需要。全局安装 `@telepat/otto` 已包含中继运行时依赖，支持 `otto start`、`otto stop`、`otto status` 和安装引导就绪检查。

**`otto setup` 会自动启动中继守护进程吗？**

是的。`otto setup` 确保中继守护进程在所选的中继 URL 端口上处于就绪状态。如果没有任何守护进程在运行，setup 会启动一个。如果已有一个匹配的守护进程在运行，setup 会复用它。

**为什么 `otto setup` 会因中继守护进程端口冲突而失败？**

Setup 检测到已有一个守护进程运行在与所选 URL 不同的端口上。使用 `otto stop` 停止现有守护进程，然后用目标中继 URL 重新运行 setup。

**为什么 `otto setup` 没有打印 Chrome 安装步骤？**

`otto setup` 在交互式 TTY 模式下输出可读指引。传入 `--non-interactive` 或在非 TTY 环境下运行以输出确定性 JSON。

**为什么 `otto setup` 会因下载或校验和错误而失败？**

`otto setup` 从发布构件中获取扩展并验证 SHA-256 校验和。失败通常意味着缺少或命名错误的发布文件、网络问题或校验和不匹配。请检查网络后重试。

**安装后如何更新扩展？**

```bash
otto extension update
```

然后在 `chrome://extensions` 中重新加载扩展（或重启浏览器），使更新后的扩展运行时重新连接。

**控制器和扩展设置存储在哪里？**

控制器设置存储在 `~/.otto/config.json`。扩展节点设置存储在 `chrome.storage.*` 中，通过扩展弹窗和选项页面进行配置。这两份存储是有意分离的，即使它们指向同一中继主机。

---

## 认证和配对

**为什么 Otto 扩展显示为灰色或空闲？**

打开 Otto 工具栏弹窗并检查安装状态。新节点等待配对批准并显示配对码。使用 `otto pair <code>` 批准它，并等待弹窗状态显示为已连接。

**为什么弹窗中控制器行显示"等待批准"？**

控制器已在中继级别注册，但尚未获得节点级访问权限。使用扩展弹窗中的行操作按钮授予访问权限。

**为什么 `otto test <site> <command>` 返回 `manual_login_required`？**

该命令需要认证，而当前浏览器会话尚未登录对应网站。在浏览器标签页中完成登录后重新运行命令。

**为什么即使客户端已注册，`otto test` 仍然报 `acl_missing_node_grant` 错误？**

控制器注册和节点访问是两个独立的控制。打开扩展弹窗，进入控制器访问，为目标节点授予该控制器客户端权限。在节点拥有的 ACL 授权存在之前，命令将被拒绝。

**为什么弹窗在已连接状态下显示扩展更新警告？**

扩展版本与它认证时使用的中继版本不同。运行 `otto extension update`，然后在 `chrome://extensions` 中重新加载扩展或重启浏览器。

---

## 命令错误

**为什么 `otto cmd` 返回 `node_offline`？**

你的 `targetNodeId` 未连接到中继。在扩展弹窗中验证扩展节点的中继 URL 和节点 ID。

**为什么标签页命令因锁冲突而失败？**

另一个控制器当前持有该 `tabSessionId` 的锁。使用有界退避重试，或切换到 `waitPolicy: wait_with_timeout`。

**为什么 `command.run` 返回 `site_mismatch`？**

解析出的标签页 URL 与命令的站点包不匹配。导航到正确的站点，或使用 `primitive.tab.open` 重新打开标签页。

**为什么 `command.run` 返回 `unexpected_command_input`？**

命令声明了严格的 `inputFields`，而你的负载包含了未声明的键。移除额外键或更新命令元数据。

**为什么 `command.run` 返回 `missing_command_input_one_of`？**

命令声明了 `inputAtLeastOneOf`。输入负载中必须至少存在该列表中的一项字段。

**为什么 `command.run` 返回 `preload_host_mismatch`？**

命令声明了 `preloadHost`，运行时在执行前导航到了该地址，但提交的 URL 主机仍不匹配。这可能由重定向、导航被阻止或站点端拦截页导致。

**为什么 `otto commands list` 因 `forbidden_action` 而失败？**

你的控制器令牌作用域不包含 `command.list`。使用更宽的作用域重新注册，或在 relay 配置中调整 `OTTO_DEFAULT_CONTROLLER_SCOPES`。

---

## 调试

**为什么重连后命令被标记为失败？**

Otto 在断连期间对进行中的命令采用快速失败机制。断连时尚在传输中的命令返回 `node_disconnected`。重连后重试。

**为什么 `otto test reddit.com getChatMessages` 中的聊天流重复出现？**

Otto 在两层进行去重：
1. 运行时拦截对等价的跨源混合响应进行抑制。
2. Reddit 命令适配器对重复的语义聊天对象进行抑制。

如果仍然看到重复，请检查适配器层。运行 `otto logs list --source node --latest 50` 检查扩展端的去重行为。

**为什么 `otto test` 打开的主机与 `<site>` 不同？**

`otto test` 使用 `command.list` 元数据中的命令 `preloadHost`（若可用），以便在执行命令前满足前置条件。如果 `preloadHost` 指向登录或入口路径，主机可能与站点不同。

**为什么非交互式 CLI 输出与 TUI 模式不同？**

TTY 会话使用 Ink UI，而非 TTY 会话返回机器可解析的 JSON，并在终端错误时设置退出码。

**为什么第二次运行 `otto client remove --all` 返回零结果？**

批量删除在撤销控制器客户端记录后清理。一旦所有客户端被删除，后续 `--all` 运行返回 `removedCount: 0`，直到有新的客户端注册。

## 下一步

- [高级故障排查](./guides/troubleshooting-advanced.md) — 错误到操作的流程。
- [错误码](./error-codes.md) — 完整的错误目录及可重试性。
- [日志与调试](./logging-debugging.md) — 日志命令和诊断序列。

## 如何安全地编辑控制器全局设置？
使用 `otto settings`。用上下键导航，Enter 编辑，`s` 保存，`q` 或 `Esc` 退出。编辑字段时，`Esc` 取消编辑。
