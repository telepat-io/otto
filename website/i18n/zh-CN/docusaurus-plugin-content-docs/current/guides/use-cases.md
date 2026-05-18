---
title: 实用用例
sidebar_position: 7
description: "映射到可靠命令路径的常用 Otto 自动化工作流。涵盖新安装、新命令验证、流测试、ACL 授权、日志关联和截图。"
keywords:
  - 用例
  - 自动化工作流
  - 命令示例
  - otto test
  - 流测试
---

# 实用用例

本页将常用的 Otto 自动化工作流映射到最快、最可靠的命令路径。使用场景矩阵选择你的流程，然后遵循匹配的手册。

## 场景矩阵

| 场景 | 主要目标 | 起始命令 |
|---|---|---|
| 新安装后的第一条命令 | 确认端到端连通性 | `otto commands list` |
| 添加并验证新命令 | 验证元数据、执行和测试 | `otto test <site> <command>` |
| 流测试和拆除 | 确认监听器关联和取消 | `otto test <site> <streamCommand> --stream-follow-ms <ms> --json` |
| 控制器客户端的 ACL 授权 | 授权针对节点的路由 | `otto client register` + 节点授权流程 |
| requestId 关联 | 跨所有组件追踪一次执行 | `otto logs list --request-id <id> --source all` |
| 捕获页面截图 | 从受管理标签页获取视觉产物 | `otto cmd --action primitive.page.screenshot` |

## 用例 1：新安装后的第一条命令

**目标：** 首次安装 Otto 后验证端到端连通性。

```bash
# 确认来自扩展的待处理配对码
otto authcode

# 批准配对码
otto pair 123-456

# 确认节点已连接且命令可见
otto commands list

# 打开受管理标签页
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# 运行站点命令（使用 tab.open 结果中的 tabSessionId）
otto cmd --action command.run \
  --payload '{"site":"reddit.com","command":"getFeed"}' \
  --tab-session <tabSessionId>
```

**验证：** `commands list` 返回 JSON 数组。`command.run` 返回 `messageType: result` 并以码 `0` 退出。

## 用例 2：添加并验证新命令

**目标：** 实现新站点命令并确认它通过所有验证门控。

1. 创建命令模块（参见[命令编写](./command-authoring.md)）。
2. 在站点包索引中注册它。
3. 运行工作区验证：

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

4. 验证发现和执行：

```bash
otto commands list --site example.com
otto test example.com getItems
otto test example.com getItems --payload '{"limit": 5}'
```

## 用例 3：流测试和拆除

**目标：** 验证监听器清单、流跟踪行为和取消拆除语义。

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

**预期：** 监听器更新按订阅 `requestId` 关联。Ctrl+C 触发 `command_cancel` 并关闭自动打开的标签页。

调试命令管道之前的原始监听器验证：

```bash
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network \
  --max-body-bytes 200000
```

## 用例 4：控制器客户端的 ACL 授权

**目标：** 授权已注册的控制器客户端向节点路由命令。

控制器注册和令牌交换在节点路由访问被授予之前成功。节点拥有的 ACL 授权是针对节点命令的最终门控。

```bash
# 1. 注册客户端
otto client register --name "automation-worker"

# 2. 获取令牌
otto client login

# 3. 从节点通过中继 ACL 端点授予
# POST /api/controller/access（需要节点持有者令牌）
```

没有授权，命令路由以 `acl_missing_node_grant` 失败。

## 用例 5：requestId 日志关联

**目标：** 跨控制器、中继和扩展节点追踪失败的请求。

```bash
# 启动所有来源的实时日志跟踪
otto logs follow --source all

# 在另一个终端中，复现故障
otto test reddit.com getChatMessages --json 2>&1 | grep requestId

# 查询限定到该 requestId 的有界节点证据
otto logs list --source node --latest 300
```

参见[requestId 关联手册](./requestid-correlation-runbook.md)获取分步流程。

## 用例 6：捕获页面截图

**目标：** 在自动化工作流中从受管理标签页获取视觉产物。

```bash
# 当前视口截图
otto cmd --action primitive.page.screenshot \
  --payload '{"tabSessionId":"<tabSessionId>","mode":"viewport","format":"png"}'

# 从 URL 获取全页截图（自动打开并关闭后台标签页）
otto cmd --action primitive.page.screenshot \
  --payload '{"url":"https://example.com","mode":"full_page","format":"jpeg","quality":85,"maxBytes":1200000}'
```

## 下一步

- [命令编写](./command-authoring.md) — 添加新站点命令。
- [高级故障排查](./troubleshooting-advanced.md) — 跨组件调试故障。
- [可复用代码片段](../snippets.md) — 可复制 curl 和 WebSocket 示例。
