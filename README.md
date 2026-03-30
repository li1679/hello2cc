# hello2cc

`hello2cc` 是一个面向 Claude Code 的**无 skills、原生优先**插件。

它的目标不是替你绑定 provider，也不是重造一层“插件 + 一堆技能”的伪工作流，而是让**已经通过你自己的网关、provider profile、ccswitch 或模型映射层接入 Claude Code 的第三方模型**，尽可能获得接近原生 `Opus / Sonnet` 的使用体验。

从 `0.0.2` 开始，主插件**不再内置任何 skills**。  
`hello2cc` 只保留三类核心能力：

- 原生优先的轻量路由提示
- 原生 `Agent` 的静默 `model` 注入
- 一次设置、长期生效的输出风格

这意味着它更接近一个“原生能力增强层”，而不是一个“带手动入口集合的插件包”。

## 设计目标

`hello2cc` 解决的是这个问题：

> 当第三方大模型已经能通过你的网关或映射层进入 Claude Code 时，如何让它们在 Claude Code 里尽可能像原生模型一样工作，而不是每次都靠 skill、prompt 模板或伪代理工作流来兜底。

因此，它遵循以下原则：

- **Provider 无关**：网关、provider profile、ccswitch、模型映射层都放在 `hello2cc` 外部
- **原生优先**：Claude Code 自带的 `ToolSearch`、`Agent`、`TeamCreate`、`Task*`、验证流程优先
- **无感运行**：安装并配置后，大部分行为都应静默生效
- **低侵入**：只增加真正能改善体验的 hooks，不接管 Claude Code 的模型体系
- **可安全切换**：切回原生模型或更换第三方映射时，不需要重写插件

## 核心能力

### 1）原生优先路由

`hello2cc` 会通过 `SessionStart` 和 `UserPromptSubmit` 给模型注入一层很薄的行为基线：

- 先用 `ToolSearch` 判断能力是否存在，而不是靠猜
- 复杂任务优先进入 `EnterPlanMode()` 或 `TaskCreate / TaskUpdate / TaskList`
- 开放式探索优先使用原生 `Agent(Explore)` 或 `Agent(Plan)`
- Claude Code / Agent SDK / hooks / MCP / settings 相关问题优先使用 `Agent(Claude Code Guide)`
- 并行任务优先使用原生 `Agent` 或 `TeamCreate + Task*`
- 结束前先做贴近改动范围的验证

它不会再引导模型“先去加载某个 skill”。

### 2）原生 Agent 静默模型注入

最关键的兼容层是 `PreToolUse(Agent)`。

当 Claude Code 即将调用原生 `Agent`，但工具输入里**没有显式传入 `model`** 时，`hello2cc` 会按照你的插件配置自动补齐合适的模型名。

默认逻辑如下：

| 原生目标 | 配置键 | 默认值 |
|---|---|---|
| 主会话 / 高能力兜底 | `primary_model` | `cc-gpt-5.4` |
| 通用子 Agent 兜底 | `subagent_model` | `cc-gpt-5.4` |
| `Claude Code Guide` | `guide_model` | `cc-gpt-5.4` |
| `Explore` | `explore_model` | `cc-gpt-5.3-codex-medium` |
| `Plan` | `plan_model` | `cc-gpt-5.4` |
| `General-Purpose` | `general_model` | `cc-gpt-5.4` |
| 带 `team_name` 的 teammates | `team_model` | 继承 `subagent_model` |

边界也很明确：

- Claude Code 已显式传入 `model` 时，`hello2cc` 不覆盖
- 它不会替代 Claude Code 自己的模型配置系统
- 它不会绑定 provider
- 它只在缺失时补齐 `Agent.model`

### 3）一次设置、长期生效的输出风格

最接近“静默、无感、原生”的方案，不是每次任务前都加载 skill，而是：

**只做一次 output style 设置，然后长期生效。**

`hello2cc` 内置 `hello2cc Native` 输出风格，会把输出收敛到：

- 简洁、结构化、行动优先
- 更贴近 Claude Code 原生任务流
- 需要时才用 ASCII 表格 / 图示
- 清晰报告验证结果

设置一次后，后续会话会持续生效。

## 架构

```text
第三方模型 API
        │
        ▼
网关 / provider profile / ccswitch
        │
        ▼
Claude Code 模型槽位映射
        │
        ▼
hello2cc
├─ SessionStart       -> 建立原生优先行为基线
├─ UserPromptSubmit   -> 注入轻量路由提示
├─ PreToolUse(Agent)  -> 静默补齐 Agent.model
└─ output-styles      -> 一次设置后长期生效的输出风格
```

从 `0.0.2` 起，主插件架构中**不再包含 `skills/`**。

## 与原生槽位映射共存

如果你已经通过 `ccswitch`、provider profile 或网关，把第三方模型映射到了 Claude Code 的原生槽位（例如 `opus`、`sonnet`），`hello2cc` 可以与这种方案自然共存。

职责分工如下：

- **Claude Code 负责模型槽位选择**
- **你的网关/映射层负责把槽位映射到真实第三方模型**
- **hello2cc 只负责在原生 Agent 调用里补齐缺失的 `model` 字段**

也就是说，`hello2cc` 不会“重写模型系统”，只是让第三方模型更顺滑地接入 Claude Code 原生工作流。

### 推荐配置 A：直接使用第三方模型别名

适合你的网关本身已经支持如 `cc-gpt-5.4`、`cc-gpt-5.3-codex-medium` 这类模型名：

- `routing_policy = native-inject`
- `primary_model = cc-gpt-5.4`
- `subagent_model = cc-gpt-5.4`
- `guide_model = cc-gpt-5.4`
- `explore_model = cc-gpt-5.3-codex-medium`

### 推荐配置 B：对齐原生槽位

适合你已经把第三方模型映射到了 Claude Code 的原生槽位：

- `routing_policy = native-inject`
- `primary_model = opus`
- `subagent_model = opus`
- `guide_model = opus`
- `plan_model = opus`
- `general_model = opus`
- `team_model = opus`
- `explore_model = sonnet`

这种模式下，`hello2cc` 注入的是原生槽位名，而真实落到哪一个第三方模型，仍由你的网关/映射层决定。

## 安装

### 1）添加本地 marketplace

```text
/plugin marketplace add /absolute/path/to/hello2cc
```

### 2）安装或升级插件

```text
/plugin install hello2cc@hello2cc-local
```

如果本地已经安装过旧版本，升级到 `0.0.2` 后会得到一个**不再暴露 skills 的主插件**。

### 3）一次性启用输出风格

使用 `/config` 设置：

```json
{
  "outputStyle": "hello2cc Native"
}
```

## 配置项

当前支持以下配置键：

- `routing_policy`
- `primary_model`
- `subagent_model`
- `guide_model`
- `explore_model`
- `plan_model`
- `general_model`
- `team_model`

推荐保持：

- `routing_policy = native-inject`

这会维持“原生优先 + 缺失时注入”的模式。

## 仓库结构

```text
hello2cc/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── output-styles/
│   └── hello2cc-native.md
├── scripts/
│   ├── lib/
│   │   ├── agent-models.mjs
│   │   ├── config.mjs
│   │   └── prompt-signals.mjs
│   ├── orchestrator.mjs
│   └── validate-plugin.mjs
├── tests/
│   └── orchestrator.test.mjs
├── CHANGELOG.md
├── LICENSE
├── package.json
└── README.md
```

## 本地验证

```bash
npm run validate
npm test
npm run check
```

## 当前限制

- `hello2cc` 可以增强显式的原生 `Agent` / `TeamCreate` 流程，但无法保证拦截 Claude Code 内部所有隐藏模型路径
- Claude Code 一方模型上的某些官方 `auto` 行为，仍然属于产品边界，第三方 provider 无法完全克隆
- `ToolSearch` 等能力最终仍依赖你的网关和 provider 兼容性

## 版本

当前公开版本：`0.0.2`

## 许可证

Apache-2.0
