---
title: Otto vs Jina 内容提取
sidebar_position: 9.5
description: "Otto 浏览器 DOM 提取与 Jina 页面抓取在 LinkedIn、Reddit 和博客内容上的并排对比。"
keywords:
  - otto
  - jina
  - 内容提取
  - 浏览器 DOM
  - 抓取
---

# Otto vs Jina 内容提取

本页记录了两种提取方法的实际对比：

- **Otto** — 通过 `otto extract-content` 从实时 Chrome 会话进行浏览器 DOM 提取
- **Jina** — 通过 `https://r.jina.ai/<url>` 进行远程页面获取和解析

对比使用三个代表性 URL，并捕获原始输出和性能指标。

## 方法

对每个 URL 我们运行了：

- `otto extract-content <url> --json`
- `curl -s "https://r.jina.ai/<url>" -w '\nTIME_TOTAL:%{time_total}\n'`

此测试有意省略了 API 密钥，使用匿名 `r.jina.ai` 端点。Jina 响应时间可能被缓存，因此仅将第一次请求的持续时间用于此对比。

原始输出文件保存在 `docs/guides/outputs/` 下：

- `otto_<slug>.json`
- `jina_<slug>.json`

此对比侧重于：提取内容质量、UI/噪音去除、评论/帖子捕获、请求持续时间、站点特定覆盖和屏蔽行为。

## Jina 速率限制背景

Jina 在两个维度上强制执行速率限制：

- **RPM** — 每分钟请求数
- **TPM** — 每分钟令牌数

限制按 IP 或 API 密钥执行，以先达到的阈值为准。匿名请求按 IP 追踪；经过身份验证的请求按键追踪。仪表板列出了端点特定限制，涵盖 Reader API、Search API、Embedding API、Reranker API、Classifier APIs、Segmenter API 和 DeepSearch。

这些限制之所以重要，是因为 Jina 是托管远程服务，而 Otto 在用户自己的浏览器中执行提取。

## 1. LinkedIn 帖子

URL：`https://www.linkedin.com/posts/techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua`

### Otto 结果
- `durationMs`：`3009`，`contentLength`：`7821`
- 输出：帖子内容和可见页面元素的清洗 markdown 提取。
- 说明：Otto 从实时浏览器页面生成了基于 DOM 的 markdown。

### Jina 结果
- `time_total`：`4.638154`
- 输出：标记为 markdown 的混合访客页面结果，但仍包含 LinkedIn 登录流程和 UI 装饰标记。
- 说明：即使没有 API 密钥，Jina 返回的是 LinkedIn 访客页面包装器，而非干净的蒸馏帖子摘要。

### 对比

| 方面 | Otto | Jina |
|---|---|---|
| 请求持续时间 | 3.01 秒 | 4.64 秒 |
| 内容长度 | 7,821 字符 | 混合访客页面 markdown |
| 输出类型 | 浏览器 DOM markdown | 原始 LinkedIn 访客页面内容 |
| UI 噪音 | 极低 | 高（登录/注册/导航/页脚） |
| 最佳适用 | 代理就绪内容提取 | 原始个人资料/访客页面获取 |

## 2. Reddit 帖子

URL：`https://www.reddit.com/r/LocalLLaMA/comments/1t1lfhj/minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000/`

### Otto 结果
- `durationMs`：`2313`，`contentLength`：`27791`
- 输出：Reddit 讨论帖的 markdown 提取，包括帖子内容和评论结构。
- 说明：Otto 能够从目标 Reddit 讨论帖提取实时页面 DOM。

### Jina 结果
- `time_total`：`1.815514`
- 输出：Jina markdown 错误页面，显示 Reddit 返回 `403 Forbidden` 且请求被屏蔽。
- 说明：Jina 无法匿名获取 Reddit 讨论帖内容。

### 对比

| 方面 | Otto | Jina |
|---|---|---|
| 请求持续时间 | 2.31 秒 | 1.82 秒 |
| 内容长度 | 27,791 字符 | 被屏蔽的错误页面 |
| 输出类型 | Markdown 提取 | 被屏蔽/受限页面通知 |
| 评论 | 提取了帖子评论 | 无可使用内容 |
| UI 噪音 | 低 | 高（屏蔽通知） |
| 最佳适用 | 社区内容的浏览器 DOM 提取 | 对匿名 Reddit 抓取不可靠 |

## 3. 博客文章

URL：`https://dennishodgson.blogspot.com/2025/05/photographic-highlights-202425.html`

### Otto 结果
- `durationMs`：`3017`，`contentLength`：`39427`
- 输出：博客文章内容的清洗 markdown 提取。
- 说明：Otto 移除了页面装饰并从实时 DOM 提取文章。

### Jina 结果
- `time_total`：`5.977519`
- 输出：文章的实际 markdown 内容，包括文本和图片链接。
- 说明：Jina 在此出版物页面上成功返回了可直接使用的 markdown 文章。

### 对比

| 方面 | Otto | Jina |
|---|---|---|
| 请求持续时间 | 3.02 秒 | 5.98 秒 |
| 内容长度 | 39,427 字符 | Markdown 文章内容 |
| 输出类型 | 浏览器 DOM markdown | 可直接使用的 markdown 页面提取 |
| UI 噪音 | 极低 | 低/中（仍包含一些提取的导航文本） |
| 最佳适用 | 从实时浏览器状态提取文章 | 原始公开博客提取 |

## 总体结论

- **Otto 在页面已加载于浏览器中时更适合代理就绪提取。** 它持续从实时 DOM 提供清洗后的 markdown。
- **Jina 对公开博客页面有效，** 但对有访问控制或反抓取保护的站点不太可靠。
- **特别是 Reddit 通过 Jina 匿名失败**，返回 `403 Forbidden` 屏蔽页面。
- **LinkedIn 通过 Jina 仍返回访客页面包装器内容，** 而非蒸馏的帖子负载。
- **Otto 在此组的提取时间为 2.3–3.0 秒，** 而 Jina 的首次请求时间在 1.8 到 6.0 秒之间。
- **仅 Jina 的初始请求时间在此有意义。** Jina 缓存结果，使重复调用可能显得不自然地快。

## 证据文件

原始捕获文件位于 `docs/guides/outputs/`，包括：
- LinkedIn 帖子相关文件
- Reddit 讨论帖相关文件
- 博客文章相关文件

这些文件保留了在对比中观察到的精确初始工具输出、时间测量和任何站点特定噪音。
