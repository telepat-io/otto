---
title: 开发指南
sidebar_position: 1
description: "Otto 贡献者的本地开发环境搭建、必需验证序列及文档编写指引。"
keywords:
  - 开发
  - 贡献
  - 本地搭建
  - 构建命令
---

## 本地开发

在仓库根目录下：

```bash
npm install
npm run build
```

常用命令：

```bash
npm run dev:relay
npm run dev:cli
npm run dev:ext
npm run e2e:manual
```

## 必需验证序列

任何代码修改后，按顺序运行：

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## 文档编写

- 文档站点源码位于 `website`。
- 保持章节布局与入门指南、指南、参考、技术、贡献对齐。
- 保持安全敏感材料脱敏，避免包含凭据示例。
