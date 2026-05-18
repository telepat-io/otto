---
title: 命令编写
sidebar_position: 3
description: "向 Otto 扩展运行时添加站点命令。涵盖元数据约定、运行时验证、错误浮现模式、安全规则和测试矩阵。"
keywords:
  - 命令编写
  - 站点命令
  - 扩展运行时
  - 命令元数据
  - 浏览器自动化
---

# 命令编写

本指南解释如何在 Otto 扩展运行时中添加站点命令，而不破坏协议、认证或生命周期保证。完成这些步骤后，你的命令将可通过 `otto commands list` 发现、通过 `otto cmd` 执行、通过 `otto test` 测试。

## 开始之前

- 熟悉[架构概述](./architecture.md)和[扩展运行时](../extension-runtime.md)。
- 一个能正常工作的 monorepo 构建（`npm install && npm run build`）。
- 了解目标站点的 DOM 和网络行为。

## 权威源码

| 关注点 | 路径 |
|---|---|
| 命令类型和元数据约定 | `extension/src/commands/types.ts` |
| 站点命令注册 | `extension/src/commands/index.ts` |
| 站点命令编排 | `extension/src/runtime/command-runtime.ts` |
| 操作执行分发 | `extension/src/runtime/command-executor.ts` |

## 步骤

### 1. 创建命令模块

创建 `extension/src/commands/<site>/<command-id>.ts`。声明与实际运行时行为匹配的元数据 — 运行时使用元数据在执行之前门控执行并净化输入。

```typescript
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    requiresAuth: false,
    inputFields: [
      { name: 'limit', type: 'number', optional: true, description: 'Max items to return' }
    ]
  },
  async execute(ctx, input) {
    const limit = Number((input as { limit?: number }).limit ?? 20);
    const items = await ctx.executeScript((max: number) => {
      return Array.from(document.querySelectorAll('[data-item]'))
        .slice(0, max)
        .map((el) => ({ text: (el.textContent ?? '').trim() }));
    }, [limit]);
    return { count: items.length, items };
  }
};
```

### 2. 理解元数据约定

| 字段 | 必填 | 用途 |
|---|---|---|
| `site` | 是 | 站点包归属和标签页 URL 验证 |
| `id` | 是 | 在 `command.run` / `command.test` 中使用的命令标识符 |
| `requiresAuth` | 是 | 认证预检是否在执行前运行 |
| `requiresDebuggerFocus` | 否 | 通过 `chrome.debugger` 选择加入焦点模拟 |
| `preloadHost` | 否 | 在执行前保证导航到主机 |
| `inputFields` | 否 | 声明式输入模式；驱动运行时验证 |
| `inputAtLeastOneOf` | 否 | 跨字段条件需求 |

### 3. 实现有界、确定的 execute 逻辑

保持 `execute(ctx, input, authMode)` 有界：无无限循环，无无界 DOM 抓取。返回确定性错误而不是静默重试。绝不自动化凭据提交。

### 4. 显式处理页面内错误

当使用 `ctx.executeScript` 或 `ctx.executeScriptWithDomHelpers` 时，Chromium 可能静默吞下页面内异常。使用以下模式保留页面级错误：

```typescript
const result = await ctx.executeScriptWithDomHelpers(async () => {
  try {
    // 你的页面逻辑在这里
    return { ok: true };
  } catch (error) {
    return {
      __ottoSerializedCommandError: true,
      code: 'site_specific_error_code',
      message: error instanceof Error ? error.message : 'site_specific_error_code',
    };
  }
}, []);

if (ctx.isSerializedScriptError(result)) {
  return result;
}
```

这使命令失败保持确定性，并在 `otto test` 输出中浮现特定的页面内诊断信息（例如 `reddit_post_comment_composer_missing`）。

### 5. 为流命令添加测试钩子（可选）

对于流式传输网络事件的命令，添加 `test(ctx, input, helpers)`。参见[命令编写模板](./command-authoring-templates.md)获取可复制的流测试钩子模板。

### 6. 在站点包中注册命令

将你的命令添加到 `extension/src/commands/index.ts` 的相关站点包中。命令现在可通过 `command.list` 发现。

### 7. 编写测试

添加涵盖验证门控、认证预检行为和执行/测试回退语义的测试。参见下面的测试矩阵。

## 运行时验证行为

当声明了 `inputFields` 时，运行时严格验证输入：

| 条件 | 错误码 |
|---|---|
| 未知输入键 | `unexpected_command_input` |
| 缺少必填字段 | `missing_command_input` |
| 类型不匹配 | `invalid_command_input_type` |
| 未满足的跨字段约束 | `missing_command_input_one_of` |

验证错误在执行 `execute` 之前拒绝命令。命令处理程序始终接收净化后的已验证输入。

## 验证成功

注册命令后：

```bash
# 确认它在命令发现中出现
otto commands list --site example.com

# 使用 otto test 运行它
otto test example.com getItems

# 带显式输入运行
otto test example.com getItems --payload '{"limit": 5}'

# 快速检视目标页面内容（默认 markdown）
otto extract-content https://example.com
```

成功运行返回带 `messageType: result` 的 JSON 结果，并以码 `0` 退出。

对于提取量大的调试，优先使用 `otto extract-content` 而非手写的原语序列。它将输出选择整合到一个地方：

- `--format markdown`（默认）用于快速页面理解
- `--format clean_html --selector <css>` 用于选择器发现和 DOM 调试
- `--format distilled_html` 用于可读性安全的文章式捕获
- `--format raw_html --selector <css>` 仅当需要精确的未过滤标记时
- `--format text --tab-session <id>` 用于从受管理标签页提取可见文本

## 安全规则

- 绝不自动化凭据提交。对需要认证的命令使用 `manual_login_required` 交接。
- 保持站点 URL 验证严格。命令仅能运行在匹配的标签页域名上。
- 返回确定性的前置条件错误而不是静默重试。
- 保持命令输出无敏感值。
- 保持输出形状足够稳定，以便 CLI 和代理解析。

## 测试矩阵

| 场景 | 为何重要 |
|---|---|
| 有效输入的成功执行 | 确认正常流程约定和负载形状 |
| 缺少必填输入 | 验证元数据验证门控 |
| 意外的输入键 | 防止隐藏/旧版负载漂移 |
| 在未认证页面上运行 `requiresAuth` 命令 | 验证显式的 `manual_login_required` 交接 |
| `command.test` 流声明路径 | 确认流生命周期和监听器清单行为 |
| `command.test` 执行回退路径 | 确保无自定义测试钩子的命令的兼容性 |

## 下一步

- [命令编写模板](./command-authoring-templates.md) — 可复制的代码模板。
- [监听器开发](./listener-development.md) — 流集成模式。
- [命令参考](../commands.md) — 操作面和运行时执行流程。
- [错误码](../error-codes.md) — 所有命令验证错误码。
