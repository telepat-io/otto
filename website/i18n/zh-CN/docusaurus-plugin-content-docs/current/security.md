---
title: 安全
sidebar_position: 1
description: "Otto 安全控制、威胁模型和运维安全清单。涵盖令牌认证、作用域执行、重放保护、拦截作用域和部署指南。"
keywords:
  - 安全
  - 威胁模型
  - 令牌认证
  - 重放保护
  - ACL
---

# 安全

## 权威源码路径

- 中继认证和速率限制：`packages/relay/src/index.ts`
- 协议级认证和错误模式：`packages/shared-protocol/src/index.ts`
- 中继安全集成测试：`packages/relay/test/integration.test.mjs`

## 基准控制

- 令牌优先的 WebSocket 认证
- 基于角色的命令授权
- 控制器命令的操作作用域授权
- 严格的模式验证
- JWT 签发者和受众验证
- 可选的旧签名密钥验证窗口，用于密钥轮换
- 刷新令牌撤销端点 (`/api/auth/revoke`)
- 持久化的中继端刷新会话存储，并在启动时清理损坏/过期条目
- 控制器客户端密钥在存储时进行哈希处理（中继存储 salt+hash，从不存储明文）
- 控制器端客户端密钥存储优先使用操作系统密钥链；支持环境变量回退 (`OTTO_CONTROLLER_CLIENT_SECRET`)
- 节点拥有的 ACL 门控，用于控制器到节点的命令路由
- 刷新令牌在 HTTP 刷新成功后轮换
- 每会话命令速率限制
- 通过命令 `replayNonce` 和时间戳接受窗口进行重放保护
- 浏览器来源节点 WebSocket 升级的来源允许列表检查
- 配置允许列表后，节点 WebSocket 升级拒绝不允许的来源并返回 HTTP 403
- 默认日志脱敏
- 需要认证的命令预检可将用户重定向到第一方登录页面而不捕获凭据
- 调试器支持的网络拦截限定于受管理的 `tabSessionId` 并验证声明的站点
- 拦截头部输出脱敏敏感字段（`Authorization`、`Cookie`、`Set-Cookie`、`Proxy-Authorization`）
- 安装时扩展构件的校验和验证

## 命令安全模型

威胁边界：

- 中继认证和作用域保护命令入口。
- 运行时控制器命令授权基于持有者令牌（访问令牌作用域 + 节点 ACL 授权），而非客户端密钥。
- 命令认证预检保护网站会话前置条件。
- 浏览器凭据始终由用户管理，设计上不会通过 Otto 命令负载传输。

当前控制：

- 命令执行前的站点匹配（不匹配时返回 `site_mismatch`）。
- 明确的网站登录手动交接（`manual_login_required`）。
- 无自动凭据输入或机密字段抓取。

## 滥用和故障保护机制

- 配对批准采用先到先得；重复批准尝试返回确定性 `pairing_not_pending`。
- 通过 `/api/controller/token` 注册的控制器客户端在节点拥有的 ACL 授予访问权限之前，其节点命令路由将被拒绝（`acl_missing_node_grant`）。
- 控制器客户端密钥仅用于 `/api/controller/token` 凭据交换，从不在运行时命令帧中传输。
- 格式错误或过期的访问令牌在 WebSocket 认证期间被拒绝，返回 `invalid_access_token`。
- 格式错误的命令信封（例如缺少 `targetNodeId`）在路由前被拒绝。
- 队列深度和每会话速率限制被强制执行以减少饥饿和滥用压力。
- 命令认证流程从不自动化最终用户凭据提交；失败的登录预检在可选的站点登录页导航后返回 `manual_login_required`。
- `chrome.debugger` 拦截保持显式选择加入，通过监听器订阅操作激活，且无法抑制 Chrome 调试器信息栏。
- 命令级调试器焦点模拟保持显式选择加入，通过 `metadata.requiresDebuggerFocus=true`。
- 调试器附加复用按所有权作用域划分：运行时仅分离由该功能路径创建的附加，以防止跨功能干扰。
- Fetch 域拦截总是继续暂停的请求，以避免在正文检索失败时导致流量死锁。
- 混合拦截的重复抑制限制了等价的跨源响应重放，减少重复负载转发面。

## 运维安全清单

1. 将 `OTTO_TOKEN_SECRET` 排除在源码控制之外，并定期轮换。
2. 在生产环境中设置 `OTTO_EXTENSION_ORIGIN` 以限制浏览器节点升级。
3. 为自动化主体使用最小权限的控制器作用域。
4. 审计日志中的重复 `forbidden_action`、`replay_rejected` 和锁冲突模式。
5. 将命令输入负载视为不受信任，在命令逻辑中验证字段。
6. 保持控制器和扩展设置分离；不要将控制器令牌复制到扩展存储中。
7. 为 `OTTO_LOG_DIR` 选择受保护的文件系统位置；它现在包含持久化的刷新会话数据（`refresh-sessions.jsonl`）。
8. 通过 `OTTO_REFRESH_TTL_DAYS` 限制刷新令牌的有效期，避免不必要的长周期。
9. 除非必要，保持 `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` 禁用；启用远程注册时，设置 `OTTO_CONTROLLER_REGISTRATION_SECRET` 并限制网络入口。
10. 将节点 ACL 授予操作视为最终用户权限操作，并审计 `controller_acl_granted` / `controller_acl_revoked` 事件。
11. 将调试器焦点元数据视为特权的可靠性工具；仅为已经证明存在后台标签页卡顿行为的命令启用。
