---
title: 安装
sidebar_position: 2
description: "安装 Otto CLI 和扩展。涵盖全局最终用户安装路径和 monorepo 贡献者开发配置。"
keywords:
  - 安装 Otto
  - npm install
  - otto setup
  - Chrome 扩展安装
  - monorepo 开发
---

# 安装

Otto 有两条安装路径：面向最终用户的全局 CLI 安装，以及面向贡献者的 monorepo 开发安装。

## 开始之前

- **Node.js 18 或更高版本** — CLI 和中继所需。
- **npm 9 或更高版本** — 用于全局安装 CLI。
- **Google Chrome** — 扩展节点作为 Chrome 扩展运行。
- **网络访问** — `otto setup` 从 Otto 发布构件下载扩展。

## 最终用户安装

全局安装 Otto CLI：

```bash
npm install -g @telepat/otto
```

CLI 包含中继运行时依赖，因此中继命令（`otto start`、`otto stop`、`otto status`）无需单独安装中继即可使用。

运行引导配置向导：

```bash
otto setup
```

Setup 执行以下操作：

1. 确认您的中继 URL（默认为 `ws://127.0.0.1:8787?role=controller`）。
2. 如果中继未运行则启动守护进程。
3. 从发布构件下载扩展并验证其校验和。
4. 打印 Chrome 所需的扩展文件夹路径。

在 Chrome 中加载扩展：

```
1. 打开 chrome://extensions
2. 启用开发者模式（右上角开关）
3. 点击「加载已解压的扩展程序」
4. 选择 otto setup 打印的文件夹路径
```

:::tip 更新扩展
发布新版 Otto 时，通过以下命令更新扩展构件：
```bash
otto extension update
```
更新完成后，在 `chrome://extensions` 中重新加载扩展或重启 Chrome。
:::

## 贡献者 monorepo 安装

此路径适用于参与 Otto 开发的贡献者。您需要从源码在本地构建并运行所有内容。

克隆仓库并安装所有工作区依赖：

```bash
git clone https://github.com/telepat-io/otto.git
cd otto
npm install
```

构建所有包：

```bash
npm run build
```

启动中继守护进程：

```bash
otto start
```

以热重载开发模式运行扩展：

```bash
npm run dev:ext
```

从构建输出手动加载扩展：

```bash
# 构建扩展输出
npm run --workspace @telepat/otto-extension build
# 然后在 chrome://extensions > 加载已解压的扩展程序 中选择 chrome-mv3/
```

扩展输出路径：`extension/output/chrome-mv3`。

以开发模式运行 CLI：

```bash
npm run dev -- commands list
```

:::note
Monorepo 构建要求所有包无 TypeScript 错误地完成构建。在加载扩展输出之前运行 `npm run check` 进行验证。
:::

## 下一步

- [快速开始](./quickstart.md) — 启动中继、配对节点、运行第一条命令。
- [otto setup 命令参考](./cli/setup.md) — 完整配置选项和非交互式模式。
- [开发指南](./development.md) — 本地开发工作流和验证序列。
