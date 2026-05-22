---
title: 测试
sidebar_position: 2
description: "Otto 如何在中继、扩展和 CLI 各层验证行为。涵盖覆盖矩阵、验收标准、命令开发者手册和 CI 指南。"
keywords:
  - 测试
  - 覆盖矩阵
  - 集成测试
  - otto test
  - e2e
---

# 测试

本页描述 Otto 如何在中继、扩展和 CLI 各层验证行为。按测试意图而非包内部结构编排，便于你在变更前后快速选择正确的验证级别。

## 权威源码路径

| 领域 | 源码 |
|---|---|
| 中继集成套件 | `packages/relay/test/integration.test.mjs` |
| 扩展运行时测试 | `extension/test/*.test.ts` |
| CLI setup/settings 及命令 UX 测试 | `packages/cli/test/*.test.ts` |
| 手动 E2E 测试工具 | `packages/relay/scripts/manual-e2e.mjs` |

## 必需验证顺序

任何代码更改后，按以下顺序运行：

1. `npm run check`
2. `npm run lint`
3. `npm run build`
4. `npm run -ws --if-present test`

此顺序使失败保持高信号质量。类型和 lint 失败通常比下游集成失败修复成本更低。

## 覆盖矩阵

| 层 | 必须保持的条件 |
|---|---|
| 协议与约定 | 共享类型编译通过，操作负载保持约定兼容 |
| 中继认证与路由 | 配对、令牌认证、作用域执行、nonce 重放防御和确定性命令路由全部通过 |
| 中继执行语义 | 终端结果、队列（每个标签页 `FIFO`）、跨标签页并行和锁生命周期不变式保持确定 |
| 中继可观测性 | 日志过滤/导出/跟踪行为、监听器订阅/取消订阅生命周期和节点监听器更新路由得以保持 |
| 扩展运行时弹性 | 离屏重连、keep-warm/启动协调、重放去重和标签页会话恢复保持稳定 |
| 扩展命令运行时 | 站点验证、认证预检、元数据验证、预加载主机门控、执行/测试回退和命令错误的确定性得以保持 |
| 监听器/拦截运行时 | 选项验证、正文捕获行为、fetch/混合语义、重复抑制和分离安全性保持正确 |
| CLI UX 与自动化模式 | `otto test`、setup/settings 行为、TTY/非 TTY 输出约定以及传输中断面保持可预测 |

## 验收标准

一项变更在以下条件成立时才告完成：命令结果仍然以 `completed`、`failed`、`timed_out` 或 `cancelled` 作为最终结果；锁和队列行为在竞争下保持确定；运行时重启协调仍能安全地修复过期的标签页/分组状态。

## 命令开发者手册

在添加或修改站点命令时使用以下顺序：

1. 使用 `otto commands list [--site <site>]` 查看命令元数据。
2. 使用最小有意义的负载运行 `otto test <site> <command>`。
3. 如果收到 `manual_login_required`，在打开的标签页中认证后重新运行。
4. 如果出现验证错误（`missing_command_input`、`missing_command_input_one_of`、`invalid_command_input_type`、`unexpected_command_input`），使负载与元数据对齐后重新运行。
5. 对于支持流的命令，验证跟踪行为和清理（`Ctrl+C` -> 确定性取消/清理）。

### 执行行为提醒

`otto test` 发送 `command.test`，如果不存在命令测试钩子则回退到 `execute`。如果 `targetNodeId` 缺失或过期且恰好有一个节点已连接，CLI 自动选择该节点；有多个节点时，传入 `--node-id`。如果省略 `--tab-session`，CLI 自动打开 `preloadHost`（如果可用），否则打开 `https://<site>`，并在完成后自动关闭该标签页（除非使用 `--wait-for-interrupt`）。

对于超时处理，`otto test` 和 `otto cmd --action command.run` 在使用默认 CLI 超时时，可能从命令描述符元数据中解析超时。如果命令描述符包含 `timeoutPolicy`，CLI 可推导出一个基于输入（例如按 `minReturnedPosts`）缩放、带有最小/最大限制的超时。显式的非默认 `--timeout` 值始终覆盖推导出的超时行为。

## TTY vs 非 TTY 约定

| 面 | TTY 行为 | 非 TTY 行为 |
|---|---|---|
| `otto test` 成功/失败 | 人类可读的状态行和页脚提示 | JSON 信封，终端失败时非零退出 |
| 流式命令 | 实时跟踪直到中断 | 机器可读流帧，直到调用方超时/停止 |
| Setup 输出 | 人类引导指引和 Chrome 操作提示文本 | 仅输出确定性 JSON |

如果控制器 WebSocket 在命令响应到达之前关闭，CLI 应输出传输中断指引并以非零退出，而无原始堆栈噪音输出。

## 手动 E2E 测试工具

在中继和扩展节点连接后运行 `npm run e2e:manual`。

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `OTTO_RELAY_HTTP_URL` | `http://127.0.0.1:8787` | 中继 HTTP 端点 |
| `OTTO_RELAY_WS_URL` | `ws://127.0.0.1:8787/?role=controller` | 中继控制器 WebSocket 端点 |
| `OTTO_NODE_ID` | `node_manual_e2e` | 目标节点身份 |
| `OTTO_E2E_OPEN_URL` | `https://www.reddit.com/` | 初始打开 URL |
| `OTTO_E2E_EXTRACT_SELECTOR` | `title` | DOM 提取选择器 |
| `OTTO_E2E_COMMAND_TIMEOUT_MS` | `10000` | 命令超时预算 |
| `OTTO_E2E_RUN_COMMAND` | 不设置 (`0`) | 设为 `1` 以包含 `command.run` |
| `OTTO_E2E_COMMAND_SITE` | `reddit.com` | 手动命令运行的站点 |
| `OTTO_E2E_COMMAND_ID` | `getPosts` | 手动命令运行的命令 id |
| `OTTO_CONTROLLER_ACCESS_TOKEN` | 不设置 | 提供后跳过自动配对批准 |

## Setup 及设置验证重点

`otto setup` 必须在交互式和非交互式环境下保持确定性，包括守护进程就绪报告和扩展构件校验和处理。在已有匹配守护进程上重新运行 setup 应报告复用而非产生重复进程，守护进程端口冲突必须以明确的修复指令告失败。

`otto settings` 必须保持键盘一致性（`上/下`、`Enter`、`s`、`q`、`Esc`）并将已验证的控制器全局值持久化到 `~/.otto/config.json`。

## CI 和自动化代理注意事项

对于自主工作流，优先使用非 TTY JSON 输出，保持负载有界，并按 `requestId` 关联故障后再扩大排查范围。当调试需要日志时，首先使用有界拉取，仅在需要时间顺序时切换到实时跟踪。
