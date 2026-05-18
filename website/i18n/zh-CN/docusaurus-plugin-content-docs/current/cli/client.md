---
title: 客户端管理
sidebar_position: 7
description: "otto client 命令的 CLI 参考  - 注册、登录、检查状态、遗忘和移除控制器客户端身份。"
keywords:
  - otto client
  - 客户端注册
  - 客户端登录
  - 控制器客户端
  - ACL
---

# 客户端管理

注册、认证和管理控制器客户端身份。控制器客户端是自动化脚本用于连接中继并发出命令的身份。

## `otto client register`

在中继上注册新的控制器客户端。

### 用法

```bash
otto client register [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--name` | | 是 | string | | 控制器客户端的显示名称 |
| `--description` | | 否 | string | | 可选的描述 |
| `--relay-url` | | 否 | string | From config | 要注册的中继 URL |
| `--json` | | 否 | boolean | false | 以 JSON 格式输出结果 |

### 示例

```bash
# 交互式注册新客户端
otto client register --name "my-automation"

# 带描述注册
otto client register --name "ci-bot" --description "CI automation client"

# 注册并以 JSON 捕获凭据
otto client register --name "ci-bot" --json
```

注册后返回客户端密钥。安全存储它 — 它仅显示一次。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 客户端注册成功 |
| `1` | 注册失败或中继错误 |

---

## `otto client login`

认证现有控制器客户端并本地存储访问凭据。

### 用法

```bash
otto client login [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--client-id` | | 否 | string | | 要认证的客户端 ID |
| `--relay-url` | | 否 | string | From config | 中继 URL |

### 示例

```bash
# 交互式登录
otto client login

# 使用特定客户端 ID 登录
otto client login --client-id abc123
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 登录成功 |
| `1` | 登录失败（凭据无效或中继错误） |

---

## `otto client status`

显示当前控制器客户端认证状态。

### 用法

```bash
otto client status [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--json` | | 否 | boolean | false | 以 JSON 格式输出 |

### 示例

```bash
otto client status

otto client status --json
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 状态已上报 |
| `1` | 未登录或配置缺失 |

---

## `otto client forget`

移除本地存储的控制器客户端凭据，而不在中继上撤销它们。

### 用法

```bash
otto client forget
```

### 示例

```bash
otto client forget
```

使用 `otto client remove` 同时在中继端撤销客户端。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 本地凭据已清除 |

---

## `otto client remove`

从中继撤销并移除控制器客户端，拆除其 ACL 授权、刷新会话和活跃连接。

### 用法

```bash
otto client remove [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--client-id` | | 否 | string | | 要移除的特定客户端 ID |
| `--all` | | 否 | boolean | false | 移除所有已注册的控制器客户端 |

### 示例

```bash
# 移除特定客户端
otto client remove --client-id abc123

# 移除所有客户端
otto client remove --all
```

`--all` 在清除后是幂等的；后续调用返回零次移除，直到有新客户端注册。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 客户端已移除 |
| `1` | 移除失败或中继错误 |

---

## 相关命令

- [otto pair / otto revoke](./pairing.md) — 管理节点配对。
- [配对与认证指南](../guides/pairing-auth.md) — 完整认证生命周期。
