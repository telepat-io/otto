---
title: 开发新命令
sidebar_position: 3
description: "规划、实现、调试和验证新站点命令的端到端代理操作指南  - 从协议设计到实时 DOM 检查再到重载循环。"
keywords:
  - 命令开发
  - 站点命令
  - DOM 检查
  - for agents
  - 代理操作指南
---

# 开发新命令

本指南涵盖添加新站点命令的完整流程。面向自主代理编写，描述适用于任何站点的决策、辅助命令、迭代循环和验证步骤的确切顺序。

命令编写 API 参考见[命令编写](/guides/command-authoring)。可复制代码模板见[命令编写模板](/guides/command-authoring-templates)。

---

## 阶段 1：写代码前先规划

在修改任何文件之前，先确定以下问题。此处的模糊会导致返工。

### 1.1 命令返回什么？

明确输出形状。如果输出代表一个通用概念（搜索结果、文章、帖子），考虑是否应在协议中添加新的共享实体类型。当相同概念出现在多个站点命令中时，可复用的实体类型带来回报。

如果你的命令返回已被表示为 `StreamDomainObject` 的内容（例如 `Article`、`Post`、`ChatMessage`、`SearchResult`），复用它们。如果概念确实是新的且可能跨站点复用，将新接口添加到 `packages/shared-protocol/src/index.ts` 并将其加入 `StreamDomainObject` 联合。否则，直接从 `executeScript` 返回的普通类型化对象即可。

### 1.2 命令需要什么输入？

区分必填和可选输入。对于有界范围的输入（页数、结果限制），提前定义最大值和默认值 — 它们同时影响元数据验证和分页逻辑。

分页输入（例如 `pages`、`limit`）应保守地默认 — 未传入 `pages` 的调用方不应被多页导航所惊讶。

### 1.3 边界情况的语义是什么？

在编写代码之前明确模糊的输出字段：
- **赞助/推广内容**：包含它并附加标志（例如 `isAd: true`），而不是静默过滤。调用方可以自行过滤；他们无法恢复隐藏的数据。
- **子链接**：仅包含对项目语义上有意义的链接，而非页面上的每个锚点。
- **图片**：返回 URL 或 `null`。跳过 base64 数据 URI — 这些通常是内联 favicon，而不是有意义的图片。

---

## 阶段 2：扩展协议（如果添加新实体类型）

当命令引入新的共享实体类型时，**首先**更新协议，在其他任何代码之前。扩展从编译后的 `dist/` 构建产物解析 `@telepat/otto-protocol`，而非从 TypeScript 源码 — dist 必须在 `npm run check` 对扩展通过之前重新构建。

```bash
# 1. 编辑 packages/shared-protocol/src/index.ts
# 2. 立即重新构建：
npm run build -w packages/shared-protocol
# 3. 现在类型检查跨所有包通过：
npm run check
```

> **为什么 dist 重要：** 扩展的 `tsconfig.json` 通过工作区 `package.json` 解析 `@telepat/otto-protocol`，后者指向 `dist/index.js`。如果跳过重新构建，`tsc` 将看不到你的新类型，`npm run check` 将因"模块没有导出成员"而失败。

---

## 阶段 3：搭建站点包框架

一个站点包位于 `extension/src/commands/<hostname>/` 并包含四个文件：

| 文件 | 用途 |
|---|---|
| `check-login.ts` | 检测用户是否已登录的 `SiteCommand` |
| `goto-login.ts` | 导航到站点登录页的 `SiteCommand` |
| `<command-id>.ts` | 你的命令实现 |
| `index.ts` | 导出将三者分组的 `SiteCommandBundle` |

在 `extension/src/commands/index.ts` 中注册该包：

```typescript
import { exampleCommands } from './example.com/index.js';
const bundles = [...existingBundles, exampleCommands];
```

如果站点不需要登录，在所有命令上设置 `requiresAuth: false` 并将 `checkLogin` 实现为始终返回 `{ loggedIn: false }` 的存根。

---

## 阶段 4：编写任何选择器前先检查实时 DOM

这是任何 DOM 提取命令最重要的阶段。**绝不基于静态检查、文档或猜测编写 CSS 类选择器。** 现代 Web 应用的 CSS 类通常是混淆的或在构建时生成的，并在部署间变化。相反，应锚定在稳定的结构标记上：

- **带语义名称的 `data-*` 属性** — `data-testid`、`data-item-id`、`data-type` 等属性与应用逻辑而非样式绑定，并在 CSS 重新设计后存活。
- **ARIA 角色和标签** — `role="article"`、`aria-label="..."`、`[role="listitem"]` 是稳定的，因为它们在可访问性方面必须保持正确。
- **结构元素语义** — `<article>`、`<h2>`、`<time>`、`<blockquote>` 携带独立于样式的含义。
- **应用特定的编译属性** — 某些应用嵌入稳定的编译标识符（例如 `jsname`、`jsaction`），比类名更稳定。查找以预期项目数量重复相同值的属性。

### 如何检查实时 DOM

使用带 `url` 参数的 `primitive.dom.extract_html`。这会打开临时标签页，等待页面完全加载，捕获完整 HTML，并自动关闭标签页。无需 `tabSessionId` 管理。

```bash
otto cmd --action primitive.dom.extract_html \
  --payload '{"url":"https://example.com/feed"}' \
  2>/dev/null > /tmp/serp.json
```

然后在捕获的 HTML 中计算候选属性以发现稳定的锚点。你在寻找属性计数与你能在页面上看到的项目数相匹配的属性：

```bash
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/tmp/serp.json')).payload.data.content;
const count=p=>(c.match(new RegExp(p,'g'))||[]).length;
console.log('data-testid=post-container:', count('data-testid=\"post-container\"'));
console.log('role=article:', count('role=\"article\"'));
console.log('<h2:', count('<h2'));
"
```

### 跨查询验证稳定性

加载两个以上不同的页面（或同一页面在不同状态下）并比较计数。如果选择器的计数可靠地等于你预期的项目数，则该选择器是稳定的：

```bash
otto cmd --action primitive.dom.extract_html --payload '{"url":"https://example.com/feed?page=1"}' 2>/dev/null > /tmp/s1.json
otto cmd --action primitive.dom.extract_html --payload '{"url":"https://example.com/feed?page=2"}' 2>/dev/null > /tmp/s2.json
```

如果一个候选属性计数在等长页面之间意外波动，它就不是可靠的锚点。继续搜索。

### 考虑蒸馏输出

`primitive.dom.extract_markdown` 生成页面的 Readability 蒸馏 markdown 版本。用它快速了解页面内容而无需解析原始 HTML。蒸馏输出适合**文章或文本内容**页面。对于**结构化列表页面**（feed、搜索结果、评论线程），它不太有用 — 它丢失了项目边界并丢弃了结构化属性。对这些页面使用原始 HTML 提取。

### 检查项目容器结构

一旦确定了稳定的锚点，检查完整项目块以理解容器、标题、正文、元数据和子链接之间的关系。在编写 `executeScript` 回调之前勾勒解析出的结构（项目容器 → 标题元素 → 正文 → 元数据）。这个草图将成为你的选择器映射。

---

## 阶段 5：实现命令

使用阶段 4 的稳定选择器编写 `executeScript` 回调。关键实现说明：

- 对深层 DOM 工作流使用 `executeScriptWithDomHelpers`
- 将浏览器端错误确定性地冒泡出来
- 使用 `closest()` 向上导航到容器
- 展开重定向 URL
- 从小图标中过滤缩略图
- 获取多页时按限制上限累积

---

## 阶段 6：构建、重载和实时测试

扩展在每次源码变更后必须重新构建，浏览器必须重载已构建的扩展。这是手动步骤 — 请用户完成。

```bash
# 1. 构建扩展
npm run build -w extension
```

然后要求用户：在 Chrome 的 `chrome://extensions` 中重载 Otto 扩展。

```bash
# 2. 验证命令已注册
otto commands list | grep -A3 <commandId>

# 3. 运行实时测试
otto test <site> <commandId> --payload '{"<requiredInput>":"<value>"}' --json
```

如果 `results` 是空数组，选择器没有匹配。返回阶段 4 重新检查实时 DOM。

---

## 阶段 7：诊断空结果或错误结果

### 空结果

如果测试返回空数组但你可以在 Chrome 标签页中看到项目，选择器没有匹配。快速诊断：获取命令导航到的确切 URL 的最新 HTML 并验证候选属性存在。

### 错误的字段值

如果返回了结果但字段错误（例如标题错误、缺失描述），使用 `node -e` 在一个已知项目周围截取 HTML 检查精确的元素结构。相应更新选择器映射。

### 脚本错误

扩展脚本错误在中继日志中显示为 `script_execution_error`。检查 `otto logs list --source node --latest 50` 获取堆栈跟踪。

---

## 阶段 8：编写测试

测试使用 `createChromeMock()`，它通过按顺序消费的 `scriptResults` 数组驱动 `scripting.executeScript`。至少覆盖：有结果返回的愉快路径、每个必填字段的缺失输入、未知字段的意外输入、错误类型的无效类型、多页累积、页返回空结果时的提前退出、跨页限制执行。

---

## 阶段 9：最终验证

按 AGENTS.md 中的顺序运行完整验证序列：

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

在实现被认为完成之前，所有四项都必须通过。

## 总结：完整循环

```
规划模式 → 扩展协议 → 重新构建协议 dist →
搭建站点包 → 检查实时 DOM →
验证 2 个以上页面/状态的选择器稳定性 →
使用稳定选择器实现命令 →
构建扩展 → 要求用户重载扩展 →
实时测试 → 结果为空或错误时迭代（重新检查 DOM，修复选择器）→
编写测试 → 验证
```
