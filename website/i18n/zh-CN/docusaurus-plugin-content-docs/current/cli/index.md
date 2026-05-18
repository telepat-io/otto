---
title: CLI 参考
sidebar_position: 1
description: "所有 Otto CLI 命令的完整参考，按命令组编排。涵盖中继生命周期、安装、配置、配对、客户端管理、命令执行、日志和监听器。"
keywords:
  - CLI 参考
  - otto 命令
  - 命令组
  - otto CLI
---

# CLI 参考

`otto` CLI 管理中继守护进程、配对扩展节点、注册控制器客户端、执行浏览器命令并尾随操作日志。所有命令支持 `--help` 查看内联用法。

## 命令组

| 分组 | 命令 | 用途 |
|---|---|---|
| [中继生命周期](./start.md) | `otto start`、`otto stop`、`otto status` | 启动、停止和检视中继守护进程 |
| [安装](./setup.md) | `otto setup` | 交互式或非交互式首次运行安装向导 |
| [配置](./config.md) | `otto config`、`otto settings` | 读取和编辑控制器配置 |
| [扩展](./extension.md) | `otto extension update`、`otto extension info` | 管理打包的扩展构件 |
| [配对](./pairing.md) | `otto authcode`、`otto pair`、`otto revoke` | 将扩展节点与中继配对 |
| [客户端](./client.md) | `otto client register/login/status/forget/remove` | 管理控制器客户端身份 |
| [命令](./commands.md) | `otto commands list`、`otto cmd`、`otto test` | 浏览、运行和流式传输浏览器命令 |
| [日志](./logs.md) | `otto logs list/follow/status/export` | 查询和流式传输中继操作日志 |
| [监听器](./listener.md) | `otto listener subscribe-network/unsubscribe/list` | 管理网络拦截流 |

## 全局行为

- 所有命令接受 `--help` 查看用法和标志描述。
- 在支持的命令上使用 `--json` 获取机器可读输出。非交互模式移除 TTY 格式化。
- 命令成功时退出 `0`，失败时非零退出。
- 当恰好有一个节点连接时，`targetNodeId` 自动选择。有多个节点时传入 `--node-id`。

## 配置文件

控制器配置存储在 `~/.otto/config.json`。使用 `otto config` 读取，`otto settings` 进行交互式编辑。

## 相关页面

- [安装](../installation.md) — 安装 CLI 和中继。
- [快速开始](../quickstart.md) — 首次运行教程。
- [配置参考](../configuration.md) — 所有中继环境变量。
