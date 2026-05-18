---
title: 快速开始
sidebar_position: 3
description: "五分钟内让 Otto 运行起来。启动中继、注册控制器、配对扩展节点并运行第一条网站命令。"
keywords:
  - 快速开始
  - otto start
  - 配对节点
  - 第一条命令
  - otto test
---

# 快速开始

完成本指南后，您将拥有一个运行中的中继，控制器与扩展节点已配对，并能看到第一条命令返回结果。

## 开始之前

- Otto CLI 已全局安装：`npm install -g @telepat/otto`
- 扩展已加载到 Chrome（如尚未完成，运行 `otto setup` — 参见[安装](./installation.md)）
- Chrome 中 Otto 扩展正在运行并显示在工具栏中

## 步骤

### 1. 启动中继

```bash
otto start
```

此命令以后台守护进程方式启动中继。验证其是否运行：

```bash
otto status
```

预期输出：`relay running`，带有进程 ID 和日志路径。

### 2. 注册控制器身份

如果是首次运行，创建一个控制器客户端并登录：

```bash
otto client register --name "my-laptop"
otto client login
```

这会将您的控制器凭据存储在 `~/.otto/config.json`。如果您已有已注册的客户端，运行 `otto client login` 刷新令牌即可。

### 3. 配对扩展节点

如果扩展尚未与此中继配对：

```bash
# 显示来自扩展的待处理认证码
otto authcode

# 批准显示的代码（格式：123-456）
otto pair <code>
```

:::info
在扩展选项中配置中继 URL 后，配对代码会出现在 Otto 扩展弹出窗口中。打开扩展并按照屏幕提示操作。
:::

### 4. 验证连接

确认节点已连接且命令可用：

```bash
otto commands list
```

预期输出：来自已连接节点的可用命令 JSON 数组。

### 5. 运行命令

```bash
otto test reddit.com getFeed
```

此命令会打开一个被管理的标签页，在 `reddit.com` 上运行 `getFeed` 命令，流式传输结果，并在完成时关闭标签页。

## 验证成功

成功运行会打印命令输出 JSON 并以代码 `0` 退出。如果您看到 `manual_login_required`，说明该命令需要您先登录网站：

1. 标签页保持打开。
2. 在浏览器中手动完成登录。
3. 重新运行：`otto test reddit.com getFeed`

## 下一步

- [CLI 参考](./cli/index.md) — 带选项、示例和退出码的完整命令列表。
- [配对与认证](./guides/pairing-auth.md) — 深入了解配对流程和控制器客户端模型。
- [使用案例](./guides/use-cases.md) — 实用命令工作流和场景矩阵。
- [故障排查](./guides/troubleshooting-advanced.md) — 常见故障的错误对应操作指南。
