---
title: 命令编写模板
sidebar_position: 4
description: "适用于最简读取命令、需要认证的命令和流命令测试钩子的可复制 TypeScript 模板。"
keywords:
  - 命令模板
  - 站点命令
  - 流命令
  - 需要认证命令
  - typescript 模板
---

# 命令编写模板

本页提供三种最常见命令类型的可复制模板。复制匹配你用例的模板并填入站点特定逻辑。

实现细节参见[命令编写](./command-authoring.md)。

## 模板索引

| 模板 | 何时使用 |
|---|---|
| [最简读取命令](#最简读取命令) | 从页面读取公开数据，无需认证或网络拦截 |
| [需要认证的命令](#需要认证的命令) | 读取需要用户已登录的私有数据 |
| [流命令测试钩子](#流命令测试钩子) | 通过 `command.test` 声明网络拦截流的命令 |

## 最简读取命令

用于公开页面数据提取。无认证预检，无流设置。

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

## 需要认证的命令

当命令要求用户已登录站点时使用。运行时在执行 `execute` 之前运行 `checkLogin`，如果用户未认证则可能发出 `manual_login_required`。

```typescript
import type { SiteCommand } from '../types.js';

export const getPrivateDataCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getPrivateData',
    displayName: 'Get Private Data',
    requiresAuth: true,
    preloadHost: 'example.com',
    inputFields: []
  },
  async execute(ctx) {
    const profile = await ctx.executeScript(async () => {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('profile_fetch_failed');
      return await res.json();
    });
    return { profile };
  }
};
```

:::warning
绝不自动化凭据提交。如果用户未登录，`requiresAuth: true` 触发 `manual_login_required` 并暂停执行，等待用户手动登录。
:::

## 流命令测试钩子

用于通过 `command.test` 声明网络拦截流的命令。钩子运行有界探测以确认流量可用后再提交到流路径。如果探测失败，回退到 `execute`。

```typescript
import type { SiteCommand } from '../types.js';

export const getChatMessagesCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getChatMessages',
    displayName: 'Get Chat Messages',
    requiresAuth: true,
    preloadHost: 'chat.example.com',
    inputFields: []
  },
  async execute(ctx) {
    // 回退：通过 DOM 或 fetch 返回缓冲的消息
    return { messages: [] };
  },
  async test(ctx, input, helpers) {
    const options = {
      tabSessionId: ctx.tabSessionId,
      site: 'example.com',
      streamAdapter: 'example.chat.v1',
      mode: 'fetch' as const,
      includeBody: true,
      urlPatterns: ['https://api.example.com/chat/events*']
    };

    const intercept = await ctx.startNetworkInterception(options);
    try {
      await ctx.navigateTab('https://chat.example.com');
      const updates = intercept.takeUpdates();
      if (updates.length > 0) {
        return {
          ready: true,
          stream: { listeners: [{ listener: 'network.http_intercept', options }] }
        };
      }
    } finally {
      await intercept.stop();
    }

    // 探测未发现流量 — 回退到 execute
    const bufferedResult = await helpers.execute(input);
    return {
      ready: false,
      fallback: { strategy: 'command_poll', reason: 'intercept_probe_unavailable' },
      bufferedResult
    };
  }
};
```

## 下一步

- [命令编写](./command-authoring.md) — 完整实现指南。
- [监听器开发](./listener-development.md) — 流集成模式。
- [可复用代码片段](../snippets.md) — 可复制 curl 和 WebSocket 示例。
