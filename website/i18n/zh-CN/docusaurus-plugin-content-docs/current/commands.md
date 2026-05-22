---
title: 命令参考
sidebar_position: 5
description: "Otto 命令操作、站点命令模型、运行时执行流程、输入元数据、网络拦截 API 和内置站点命令的完整参考。"
keywords:
  - 命令参考
  - 操作面
  - 站点命令
  - command.run
  - 网络拦截
---

# 命令参考

Otto 命令服务于两类受众：实现扩展包的命令作者，以及通过 CLI 执行验证行为的控制器用户。命令模型是站点限域的、元数据驱动的，且经过严格验证，因此处理程序在有效标签页上下文中接收的是已净化的输入。

## 权威源码路径

| 关注点 | 源码 |
|---|---|
| 命令分发和执行 | `extension/src/runtime/command-executor.ts` |
| 站点命令编排 | `extension/src/runtime/command-runtime.ts` |
| 站点命令包 | `extension/src/commands/**` |
| 共享操作约定 | `packages/shared-protocol/src/index.ts` |
| 中继终态化和路由 | `packages/relay/src/index.ts` |

## 操作面

| 分组 | 操作 |
|---|---|
| 原始标签页 | `primitive.tab.open`、`primitive.tab.close`、`primitive.tab.navigate`、`primitive.tab.query` |
| 原始 DOM | `primitive.dom.extract_text`、`primitive.dom.extract_html`、`primitive.dom.extract_clean_html`、`primitive.dom.extract_distilled_html`、`primitive.dom.extract_markdown` |
| 原始页面 | `primitive.page.screenshot` |
| 命令 | `command.list`、`command.run`、`command.test`、`command.reddit_posts`（旧版别名） |
| 监听器 | `listener.subscribe`、`listener.unsubscribe` |
| 常用 CLI 入口 | `otto commands list`、`otto test <site> <command>`、`otto extract-content [url]`、`otto cmd --action ...` |

`otto extract-content` 是推荐的用于内容提取的高级 CLI 路径，默认输出 markdown。它在底层根据 `--format` 映射到原始操作（`primitive.dom.extract_markdown`、`primitive.dom.extract_clean_html`、`primitive.dom.extract_distilled_html`、`primitive.dom.extract_html` 和 `primitive.dom.extract_text`）。

对于 DOM/选择器调试，`--format clean_html` 通常是最有用的模式。

## 站点命令模型

命令按站点分组在 `extension/src/commands/<site>/` 下。每个站点包提供认证原语（`checkLogin`、`gotoLogin`）以及一个或多个导出元数据和执行逻辑的命令模块。

运行时暴露 `executeScript(...)` 和 `executeScriptWithDomHelpers(...)`。当选择器必须遍历嵌套的 Shadow DOM 时，使用 DOM 辅助器变体。

`primitive.page.screenshot` 接受 `tabSessionId` 或 `url` 目标解析。仅 URL 调用使用临时后台标签页，并返回带有图像元数据和 `contentBase64` 的终端负载。`mode=viewport` 使用标签页捕获 API；`mode=full_page` 使用 CDP。

## 命令约定

每个命令模块将声明式元数据与执行钩子组合在一起。

| 字段 | 必填 | 用途 |
|---|---|---|
| `metadata` | 是 | 身份、展示元数据、标签、认证需求 |
| `metadata.requiresDebuggerFocus` | 否 | 对节流敏感的流程选择加入焦点模拟 |
| `metadata.inputFields` | 否 | 声明式输入模式（`name`、`type`、`description`、`optional`） |
| `metadata.inputAtLeastOneOf` | 否 | 跨字段的最小存在性约束 |
| `metadata.preloadHost` | 否 | 在执行路径前强制执行的主机门控 |
| `execute(ctx, input, authMode)` | 是 | 主要命令行为 |
| `test(ctx, input, helpers)` | 否 | 专用的 `command.test` 钩子 |

支持的声明式输入类型：`string`、`number`、`boolean`、`object`、`array`。

当 `metadata.inputFields` 存在时，运行时强制执行必填字段、精确类型检查（无强制转换）、未知键拒绝、可选的 `inputAtLeastOneOf` 检查，以及净化到仅声明键。

## 运行时执行流程

Otto 的命令执行精心设计顺序以实现确定性失败：

1. 解析命令负载（`command.run`、`command.test` 或旧版别名映射）。
2. 解析站点包和命令元数据。
3. 解析并验证 `tabSessionId` 和站点 URL 匹配。
4. 当声明式输入元数据存在时，进行验证和净化。
5. 对 `requiresAuth` 命令运行认证预检。
6. 配置后应用 `preloadHost` 门控。
7. 执行命令模式（`execute` 用于 run，`test` 钩子带 execute 回退用于 test）。
8. 返回标准化的终端结果或结构化错误。

需要认证的命令从不自动化凭据输入。在 `authMode=auto` 模式下，运行时可能导航到登录页并返回 `manual_login_required` 供显式的人工交接。

## 焦点模拟和 DOM 辅助器指南

`requiresDebuggerFocus` 仅在站点/标签页验证成功后激活焦点模拟。激活失败是确定性的：`debugger_focus_unavailable`、`debugger_focus_conflict`、`debugger_focus_permission_denied`、`debugger_focus_attach_failed`、`debugger_focus_command_failed`。

`executeScriptWithDomHelpers(...)` 在页面上下文中安装幂等的深层查询辅助器：

- `window.__ottoDeepQuerySelector(root, selector)`
- `window.__ottoDeepQuerySelectorAll(root, selector)`

## 内置站点

| 站点 | 命令 |
|---|---|
| `reddit.com` | `getPosts`、`getUserInfo`、`sendChatMessage`、`getChatMessages`、`commentOnPost` |
| `linkedin.com` | `getPosts`、`commentOnPost` |
| `news.ycombinator.com` | `getFrontPage` |
| `google.com` | `getSearchResults` |

### Google 命令说明

| 命令 | 关键行为 |
|---|---|
| `getSearchResults` | 需要 `query`；导航到 Google 搜索并默认提取首页结果。可选 `pages`（1–5，默认 1）控制获取多少页搜索结果。可选 `limit`（1–100，默认 10）限制返回的总结果数。每个结果携带 `title`、`url`、`description`、`links`（附加链接）、`image`（缩略图或 null）、`rank` 和 `isAd`。返回 `content.search_result` 实体。 |

### Reddit 命令说明

| 命令 | 关键行为 |
|---|---|
| `getPosts` | 通过 `.json` 补充帖子永久链接；支持 `minReturnedPosts`；返回 `content.post` 树 |
| `getUserInfo` | 按用户名/ID 查找或默认当前会话；返回 `entity.user` |
| `sendChatMessage` | 支持 `roomId` 直接发送或基于用户名创建房间 + 通过 Shadow DOM 发送 |
| `commentOnPost` | 导航到帖子 URL；填写 `shreddit-composer`；提交顶级评论 |
| `getChatMessages` | 读取 Matrix 历史记录/同步；可通过 `network.http_intercept` 发出流清单 |

### LinkedIn 命令说明

| 命令 | 关键行为 |
|---|---|
| `getPosts` | 提取 LinkedIn 帖子，支持主页信息流或搜索结果，带语义过滤、通过控制菜单复制链接获取规范帖子 URL、有界滚动补充和按 `minReturnedPosts` 缩放超时策略 |
| `commentOnPost` | 导航到 LinkedIn 帖子 URL，填写页内评论编辑器，提交评论，并通过匹配最新渲染的评论文本确认发送 |

#### linkedin.com commentOnPost 输入

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `postUrl` | string | 是 | `linkedin.com` 上的 LinkedIn 帖子 URL；规范化为 `https://www.linkedin.com/...` 形式。 |
| `commentBody` | string | 是 | 要提交的评论文本。空值或仅含空白字符的值将被拒绝。 |

#### linkedin.com commentOnPost 确认语义

- 命令等待评论编辑器（`.ql-editor[contenteditable="true"]`）并注入 `commentBody`。
- 等待提交控件出现/可用（支持多个提交按钮选择器）。
- 提交点击后，以短延迟重试读取第一个 `.comments-comment-item__main-content` 节点。
- 成功需要规范化的渲染文本与规范化的 `commentBody` 匹配；否则返回确定性的未确认诊断信息。

#### linkedin.com commentOnPost 示例

```bash
# 在 LinkedIn 帖子上提交顶级评论
otto test linkedin.com commentOnPost --payload '{"postUrl":"https://www.linkedin.com/posts/example_post-id","commentBody":"Looks great"}'
```

#### linkedin.com getPosts 输入

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `source` | string | `home` | 来源：`home`（默认）或 `search` |
| `keyword` | string | — | 搜索关键词。`source` 为 `search` 时必填 |
| `sort` | string | `top` | 搜索排序：`top`（相关性）或 `latest`（发布日期） |
| `t` | string | `day` | 搜索时间过滤：`day`、`week` 或 `month` |
| `minReturnedPosts` | number | `5` | 尝试返回的最小帖子数。运行时限制在 `1..200`。 |
| `getClipboardPermission` | boolean | `false` | 权限辅助模式。保持页面短暂存活使用户授予剪贴板读取权限并重试提取。在此模式下，命令只针对一篇帖子。 |

#### linkedin.com getPosts 输出语义

- 返回 `{ posts: content.post[] }`。
- `title` 对于 LinkedIn 帖子故意留空。
- `content` 为必填且非空；缺失或内容为空的帖子将被丢弃。
- `url` 是从帖子控制菜单复制的规范帖子链接，而非个人资料 URL。
- `id` 规范化为 `linkedin:<post-slug-from-url>`。
- `author` 携带规范化的身份字段，并在 `author.originalEntity.profileUrl` 中保留源个人资料 URL。

#### linkedin.com getPosts 超时策略

命令描述符通过 `timeoutPolicy` 公告超时提示：

- `defaultMs`：`60000`
- 缩放：`baseMs + (minReturnedPosts * perUnitMs)`
- 当前缩放值：`baseMs=45000`、`perUnitMs=4000`、`minMs=45000`、`maxMs=300000`

控制器可在用户超时保持默认值时使用此元数据。

#### linkedin.com getPosts 认证和权限错误

- `manual_login_required`：用户必须手动登录 LinkedIn，然后重新运行。
- `clipboard_permission_prompt_pending`：剪贴板权限仍处于提示状态；允许权限后以 `getClipboardPermission=true` 重试。
- `clipboard_permission_denied`：剪贴板权限被拒绝；在站点设置中启用剪贴板访问后重试。

#### linkedin.com getPosts 示例

```bash
# 默认主页信息流提取
otto test linkedin.com getPosts

# 请求至少 15 篇帖子
otto test linkedin.com getPosts --payload '{"minReturnedPosts":15}'

# 搜索帖子
otto test linkedin.com getPosts --payload '{"source":"search","keyword":"aluminum purchasing","sort":"top","t":"week"}'

# 剪贴板读取的权限辅助流程
otto test linkedin.com getPosts --payload '{"getClipboardPermission":true}'
```

## 命令网络拦截 API

命令可使用运行时上下文辅助器启动响应拦截：

```typescript
const stream = await ctx.startNetworkInterception({
  urlPatterns: ['https://www.reddit.com/api/*'],
  mode: 'hybrid',
  includeBody: true,
  maxBodyBytes: 200_000,
});

await ctx.navigateTab('https://www.reddit.com/');

const deadline = Date.now() + 5000;
const captured: unknown[] = [];
while (Date.now() < deadline) {
  const updates = stream.takeUpdates();
  if (updates.length > 0) {
    captured.push(...updates);
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await stream.stop();
return { capturedCount: captured.length, captured };
```

拦截始终绑定到命令的受管理 `tabSessionId`。运行时在命令执行完成或抛出异常时自动停止所有由命令启动的活跃拦截。

运行时拦截管理器发出的更新类型：`network.response`、`network.error`、`network.detached`。

## 错误码

| 类别 | 错误码 |
|---|---|
| 通用确定性错误 | `unknown_site`、`unknown_command`、`site_mismatch`、`missing_tab_session`、`unknown_tab_session`、`manual_login_required` |
| Reddit 特定错误 | `reddit_user_not_found`、`reddit_user_unmessageable`、`reddit_rate_limited`、`reddit_matrix_token_missing` |

完整目录见[错误码](./error-codes.md)。

## 编写指南

1. 保持命令执行在时间和负载大小上均有界。
2. 返回数据中不要包含密钥或凭据。
3. 优先使用稳定的选择器和空值安全的提取逻辑。
4. 返回具有可预测字段的结构化对象。
5. 仅在需要网站会话状态时使用 `requiresAuth`。
6. 当源负载可安全暴露时，附加 `originalEntity`。

## 开发者测试流程

```bash
# 检查命令元数据和声明的输入
otto commands list --site <site>

# 运行本地执行测试
otto test <site> <command>

# 带负载运行
otto test <site> <command> --payload '{"limit": 5}'
```

## 下一步

- [命令编写](./guides/command-authoring.md) — 构建新的站点命令。
- [命令编写模板](./guides/command-authoring-templates.md) — 可直接复制的 TypeScript 模板。
- [监听器开发](./guides/listener-development.md) — 支持流的命令集成。
