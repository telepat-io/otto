---
title: 扩展管理
sidebar_position: 5
description: "otto extension update 和 otto extension info 的 CLI 参考  - 下载和检视打包的 Otto Chrome 扩展构件。"
keywords:
  - otto extension
  - 扩展更新
  - 扩展信息
  - chrome 扩展
  - 扩展下载
---

# 扩展管理

下载和检视打包的 Otto Chrome 扩展构件。

## `otto extension update`

下载最新（或指定版本）的 Otto 扩展并保存到本地。

### 用法

```bash
otto extension update [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--version` | | 否 | string | latest | 要下载的特定扩展版本 |
| `--output` | `-o` | 否 | string | | 下载的扩展 zip 的输出路径 |

### 示例

```bash
# 下载最新扩展
otto extension update

# 下载指定版本
otto extension update --version 1.2.0

# 下载到指定路径
otto extension update --output ./my-extension.zip
```

下载的 zip 在解压前经过校验和验证。不匹配时以明确的校验和错误失败。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 扩展下载并验证成功 |
| `1` | 下载失败、校验和不匹配或网络错误 |

---

## `otto extension info`

打印当前已安装扩展构件的元数据。

### 用法

```bash
otto extension info
```

### 示例

```bash
otto extension info
```

输出包括版本、文件路径和校验和状态。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 信息打印成功 |
| `1` | 未找到扩展或元数据无法读取 |

---

## 相关命令

- [otto setup](./setup.md) — 在首次运行安装中下载扩展。
