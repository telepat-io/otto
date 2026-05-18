---
title: 配对
sidebar_position: 6
description: "otto authcode、otto pair 和 otto revoke 的 CLI 参考  - 将扩展节点与中继配对并管理节点凭据。"
keywords:
  - otto authcode
  - otto pair
  - otto revoke
  - 节点配对
  - 配对码
---

# 配对

将扩展节点与中继配对并管理节点凭据。

## `otto authcode`

生成扩展用于完成配对的配对授权码。

### 用法

```bash
otto authcode [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--relay-url` | | 否 | string | From config | 向其请求授权码的中继 URL |

### 示例

```bash
# 生成配对码
otto authcode

# 针对特定中继生成配对码
otto authcode --relay-url http://my-relay:8787
```

生成的代码输入到扩展的弹窗或选项页面中完成配对。代码在短时间窗口后过期。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 授权码已生成并显示 |
| `1` | 联系中继失败或中继错误 |

---

## `otto pair <code>`

使用扩展弹窗中显示的代码批准待处理的配对请求。

### 用法

```bash
otto pair <code> [options]
```

### 参数

| 参数 | 必填 | 描述 |
|---|---|---|
| `<code>` | 是 | 扩展弹窗中显示的配对码 |

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--relay-url` | | 否 | string | From config | 批准配对的中继 URL |

### 示例

```bash
# 批准配对请求
otto pair ABC123

# 针对特定中继批准配对
otto pair ABC123 --relay-url http://my-relay:8787
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 配对已批准 |
| `1` | 代码未找到、已过期或中继错误 |

---

## `otto revoke`

撤销扩展节点的配对，使其令牌失效并强制重新配对。

### 用法

```bash
otto revoke [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--node-id` | | 否 | string | | 要撤销的特定节点 ID（省略则撤销全部） |

### 示例

```bash
# 撤销所有已配对节点
otto revoke

# 撤销特定节点
otto revoke --node-id node_abc123
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 节点已撤销 |
| `1` | 撤销失败或中继错误 |

---

## 相关命令

- [otto setup](./setup.md) — 完整的首次运行安装，包括配对。
- [otto client](./client.md) — 管理控制器客户端身份。
- [配对与认证指南](../guides/pairing-auth.md) — 配对生命周期和令牌管理。
