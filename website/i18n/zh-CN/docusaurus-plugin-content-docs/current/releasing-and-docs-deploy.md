---
title: 发布与文档部署
sidebar_position: 2
description: "如何构建和部署 Otto 文档站点、通过 Release Please 发布包以及部署扩展构件。"
keywords:
  - 发布
  - 文档部署
  - release please
  - GitHub Pages
---

## 本地构建文档

```bash
npm run docs:build
npm run docs:serve
```

## 本地开发模式

```bash
npm run docs:start
```

## 部署变量

Docusaurus 配置支持：

- DOCS_URL（默认 https://docs.telepat.io）
- DOCS_BASE_URL（默认 /otto/）
- GITHUB_OWNER（默认 telepat-io）
- GITHUB_REPO（默认 otto）
- GH_PAGES_BRANCH（默认 gh-pages）

使用 DOCS_LOCAL=true 以获取 localhost 基础路径。

## Release Please 包版本管理

发布管理由 `.github/workflows/release-please.yml` 处理，使用 `release-please-config.json` 和 `.release-please-manifest.json`。

- 受管理的组件包括 CLI、中继、协议和扩展。
- 所有组件版本通过 release-please 配置中单一的 `.`（根）包条目保持同步，设置 `include-component-in-tag: false`，因此所有包共享一个 `v<version>` 标签（例如 `v0.8.5`）。
- release-please 配置中的 `extra-files` 列表确保 CLI、中继、协议和扩展的 `package.json` 版本字段和 `.version` 文件都被一同升级，同时更新内部的 `@telepat/*` 依赖固定。

当发布 PR 被打开时，预期版本升级和内部 `@telepat/*` 依赖更新将一同包含在内。

## 工作流触发与任务流程

`release-please.yml` 工作流在每次**推送到 `main`** 时触发。并非每次推送都会产生发布——该工作流使用任务级门控确保发布和扩展上传仅在创建新发布时运行。

### 任务 1：`release-please`

运行 `googleapis/release-please-action@v4`。此任务要么：

- **创建或更新** 发布 PR（尚无新发布 — 无下游发布）。
- 当发布 PR 被合并时**创建 GitHub 发布**（设置 `releases_created: true` 和 `.--release_created: true`）。

当 release-please **未** 创建发布时，**reconcile** 步骤检查已合并但仍携带 `autorelease: pending` 标签的 PR。如果合并的发布 PR 被 release-please 遗漏（例如由于竞态或 v4 标签跳过），reconcile 步骤手动创建缺失的标签和 GitHub 发布，然后将 PR 重新标记为 `autorelease: tagged`。

### 任务 2：`determine-release-tag`

作为下游任务的门控。按顺序检查三个条件：

1. **release-please 创建了发布**（`cli_release_created == 'true'`）：输出 release-please 的新标签。
2. **reconcile 恢复了卡住的 PR**（`reconciled_tag` 非空）：输出已协调的标签。
3. **两者皆非**（无新发布的普通推送）：输出空字符串，使所有下游任务跳过。

此门控防止 `publish-packages` 和 `upload-extension-assets` 在每次推送到 `main` 时运行。只有真正的新发布或成功协调的卡住发布才会生成非空的 `release_tag`。

### 任务 3：`publish-packages`

仅在 `release_tag != ''` 时运行。检出发布标签，运行协议、中继和 CLI 的完整包质量门控（typecheck、lint、build、test），然后将三个包发布到 npm 并附带来源证明。

发布前验证每个包版本是否与发布标签版本匹配。

### 任务 4：`upload-extension-assets`

仅在 `release_tag != ''` 时运行。检出发布标签，构建扩展，运行扩展质量门控（typecheck、lint、build、test），压缩扩展，将 `.zip` 和 `.sha256` 校验和上传到 `v<version>` GitHub 发布。

### 流程图示

```
推送到 main
  │
  ▼
release-please 任务
  ├── 创建/更新发布 PR → 无下游发布
  ├── 创建发布（合并！）  → cli_release_created=true
  └── 无发布，协调步骤    → reconciled_tag=vX.Y.Z（或空）
        │
        ▼
determine-release-tag 任务
  ├── release_created=true → tag=vX.Y.Z  ──► publish-packages
  │                                          └─► upload-extension-assets
  ├── 已协调标签           → tag=vX.Y.Z  ──► publish-packages
  │                                          └─► upload-extension-assets
  └── 皆非                  → tag=          ✔（跳过发布与上传）
```

## 为什么不使用 `on: release` 或 `on: push: tags`？

工作流有意避免 `on: release` 或 `on: push: tags` 触发器，以避免跨工作流链式调用。使用由 `on: push: branches: [main]` 触发的单一工作流并配合内部任务门控意味着：

- 所有发布步骤（标签创建、npm 发布、扩展上传）在单一工作流运行中使用一个 `GITHUB_TOKEN` 完成。无需 PAT。
- `determine-release-tag` 门控确保只有实际的发布事件触发发布，而普通推送到 main 在门控处提前退出。
- 协调步骤弥补了 release-please v4 跳过已合并 PR 标签创建的情况，无需单独恢复工作流。
