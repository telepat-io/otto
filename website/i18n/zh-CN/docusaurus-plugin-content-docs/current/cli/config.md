---
title: 配置
sidebar_position: 4
description: "otto config 和 otto settings 的 CLI 参考  - 读取和交互式编辑存储在 ~/.otto/config.json 中的 Otto 控制器配置。"
keywords:
  - otto config
  - otto settings
  - 控制器配置
  - config.json
---

# 配置

读取和编辑 Otto 控制器配置。配置存储在 `~/.otto/config.json`。

## `otto config`

以 JSON 格式打印当前控制器配置。

### 用法

```bash
otto config
```

### 示例

```bash
# 打印当前配置
otto config
```

输出为 stdout 的 JSON。字段包括中继 URL、客户端身份和存储的设置。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 配置打印成功 |
| `1` | 配置文件缺失或无法读取 |

---

## `otto settings`

打开交互式设置编辑器以更新控制器全局配置值。

### 用法

```bash
otto settings
```

### 键盘快捷键

| 键 | 操作 |
|---|---|
| `↑` / `↓` | 导航设置项 |
| `Enter` | 编辑所选设置 |
| `s` | 保存更改 |
| `q` / `Esc` | 不保存退出 |

### 示例

```bash
otto settings
```

可编辑字段包括中继 URL 和其他控制器全局值。更改保存后持久化到 `~/.otto/config.json`。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 设置已保存或干净退出 |
| `1` | 写入配置失败 |

---

## 相关命令

- [otto setup](./setup.md) — 首次运行安装向导，填充初始配置。
- [otto client status](./client.md) — 检视已注册客户端身份。
