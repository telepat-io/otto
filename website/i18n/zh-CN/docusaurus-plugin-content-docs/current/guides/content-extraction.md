---
slug: /guides/content-extraction
title: 内容提取
sidebar_position: 9
description: "Otto 如何从实时浏览器标签页中提取页面内容、支持的格式，以及为什么这让代理更快、更准确且本地驱动。"
keywords:
  - 内容提取
  - markdown 提取
  - 浏览器自动化
  - 页面抓取
  - 代理工作流
---

# 内容提取

Otto 使用用户自己的 Chrome 会话从实时浏览器标签页中提取页面内容。这使其比远程抓取或浏览器农场更适合代理，因为内容来自用户实际渲染的真实页面。

## 工作原理

当代理或控制器调用 `otto extract-content` 时，Otto 将请求通过中继路由到附加到目标标签页的扩展节点。扩展使用页面的实时 DOM 和当前会话状态直接在浏览器运行时中执行提取。

这意味着 Otto 提取的是 JavaScript 执行后、用户认证后以及延迟加载内容后的最终渲染页面。

## 支持的格式

Otto 支持多种提取输出，使自动化工作流可以为任务选择合适的形式：

- `markdown` — 浏览器安全的 markdown，保留标题、列表、链接、内联代码和表格结构。这是默认格式，最适合代理摄入。
- `clean_html` — 保留 DOM 的 HTML，移除脚本/样式/内联处理程序，同时保留语义属性（`data-*`、`aria-*`、`role`）。这是选择器发现和命令编写的最佳格式。
- `distilled_html` — 以内容为中心的 HTML，用于以可读性优先的提取流程。
- `raw_html` — 当前 DOM 的完整 HTML，包括页面外壳和脚本/样式标签。
- `text` — 纯文本提取，用于摘要或快速内容检查。

## 应该使用哪种格式？

- 使用 `markdown` 进行摘要和 LLM 摄入。
- 使用 `clean_html` 进行 DOM 检查和可靠的选择器构建。
- 仅当你特别需要类似文章的清���内容时使用 `distilled_html`。
- 仅当需要精确的页面标记保真度时使用 `raw_html`。
- 使用 `text` 进行快速纯文本检查。

## 为何对代理重要

- **免费且本地** — 提取在用户自己的浏览器中运行。无需外部抓取服务、无远程云浏览器农场、无额外的页面获取。
- **快速** — 浏览器节点已经加载了页面，因此 Otto 可以立即从实时标签页中提取内容，而不是从远程请求进行重建。
- **准确** — 提取看到的是实际渲染的 DOM，包括动态内容、客户端状态和站点特定的页面组成。
- **代理就绪** — markdown 输出针对 LLM 消费进行了优化，保留结构和可读性，同时最小化令牌开销。

## 命令

使用高级提取命令：

```bash
# 最适合选择器发现和自动化编写
otto extract-content https://example.com/article --format clean_html

# 最适合代理摘要（默认）
otto extract-content https://example.com/article --format markdown
```

在底层，Otto 将此映射到浏览器 DOM 提取原语：

- `primitive.dom.extract_markdown`
- `primitive.dom.extract_clean_html`
- `primitive.dom.extract_distilled_html`
- `primitive.dom.extract_html`
- `primitive.dom.extract_text`

## 参见

- [架构](/guides/architecture) — Otto 的控制器、中继和节点模型。
- [配对与认证](/guides/pairing-auth) — 浏览器节点配对和令牌生命周期。
- [监听器开发](/guides/listener-development) — 支持流的命令和网络自动化。
- [Otto vs Jina 内容提取](./otto-vs-jina-content-extraction.md) — 浏览器 DOM 提取与 Jina 远程页面获取的实际对比。
