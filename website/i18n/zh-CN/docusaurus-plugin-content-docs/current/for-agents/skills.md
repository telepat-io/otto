---
title: Skills
sidebar_position: 4
description: "用于 AI 代理工作流的 Otto Skill 包。"
keywords:
  - skills
  - SKILL.md
  - 代理 skills
  - 自动化
---

# Skills

Otto 提供一个 Skill 包，为 AI 代理提供零上下文浏览器自动化工作流指南。

## 主要 Skill 包

`skill/otto-cli/` 包是 Otto 的可安装 Skill 包。

- **位置**：`skill/otto-cli/SKILL.md`（仓库根目录）
- **用途**：引导代理完成安装、配置、命令执行、调试和 MCP 集成
- **格式**：符合 Agent Skills 规范

### 用例

- 从零开始安装和配置 Otto
- 可靠地运行浏览器自动化命令
- 使用日志和 requestId 关联调试失败命令
- 向代理框架（Claude、Cursor、VS Code 等）注册 Otto
- 使用 MCP 服务器进行编程式访问

### 核心文件

`skill/otto-cli/SKILL.md` 包含：

- 安装和配置指引
- 所有操作的确定性工作流
- MCP 工具集文档
- 参数语义和约束
- 注意事项和陷阱
- 故障处理矩阵
- 来源证据映射

### 配套参考资料

- `references/command-catalog.md` — 完整命令/参数矩阵
- `references/troubleshooting.md` — 故障诊断
- `references/framework-patterns.md` — 可复用工作流模式

## 安装位置

### 项目范围

- `.agents/skills/otto-cli/`
- `.github/skills/otto-cli/`
- `.cursor/skills/otto-cli/`

### 用户范围

- `~/.agents/skills/otto-cli/`
- `~/.copilot/skills/otto-cli/`
- `~/.claude/skills/otto-cli/`

## 必需的 Skill 约定

每个发布的 Skill 必须记录：

1. **名称**：`otto-cli`（kebab-case，匹配目录）
2. **输入**：中继 URL、站点、命令、节点 ID、标签页会话、认证模式
3. **护栏**：绝不自动化凭据提交，始终要求 ACL 批准
4. **输出**：命令结果、日志条目、截图
5. **故障模式**：`manual_login_required`、`acl_missing_node_grant`、`node_offline`、`timed_out`
6. **验证提示**：应触发和不应触发的示例

## 发布规则

- 规范页面：`docs/for-agents/skills.md`
- 链接到人类可读文档：`docs/installation.md`、`docs/quickstart.md`
- 具体示例：所有命令示例均可直接复制使用
- 同步要求：Skill 更新必须与 CLI 行为变更在同一变更中进行

## 同步和漂移策略

当 MCP 工具面发生变化时，在同一变更中更新：

1. `packages/cli/src/mcp/tools.ts`（模式和约定）
2. `packages/cli/src/mcp/server.ts`（处理程序）
3. `docs/for-agents/mcp-server.md`（MCP 文档）
4. `skill/otto-cli/SKILL.md`（Skill 文档）

当代理安装目标发生变化时，更新：

1. `packages/cli/src/agent/install.ts`（安装逻辑）
2. `docs/for-agents/agent-setup.md`（安装文档）
3. `skill/otto-cli/SKILL.md`（Skill 文档）

## 相关页面

- [MCP 服务器](./mcp-server.md) — MCP 服务器文档
- [代理安装](./agent-setup.md) — 框架注册指引
- [For Agents](/for-agents/) — 代理约束和决策流程
