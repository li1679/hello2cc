# hello2cc

`hello2cc` 是一个面向 Claude Code 的静默型插件。

它不负责接入模型、配置 provider、处理网关或替你开通权限；它负责的是另一层问题：

**当你已经把第三方模型接进 Claude Code 之后，让它更像原生 Opus 一样，去发现、判断并正确使用 Claude Code 当前真实暴露出来的工具、Agent、Skill、workflow、MCP、计划与团队能力。**

当前版本：`0.3.0`

---

## 一句话理解

如果你已经通过下面任一方式把模型接进 Claude Code：

- CCSwitch
- provider profile
- API gateway / 反代
- 原生槽位映射
- 其他模型切换层（例如 helloswitch）

那么 `hello2cc` 解决的是：

> **模型“能接入”之后，怎样在 Claude Code 里更自然、更准确地使用宿主能力，而不是只会聊天或只会绕路。**

---

## hello2cc 现在重点做什么

| 方向 | 作用 |
|---|---|
| 更细 capability graph | 感知当前会话里真实暴露的 tools、agents、surfaced skills、已加载 workflows、deferred tools、MCP resources |
| surfaced skill / workflow 连续体 | 识别已经 surfaced 的 skill、已经加载过的 slash command / skill 参数、已经出现过的 workflow |
| agent subtype tool surface | 明确 `Explore`、`Plan`、`General-Purpose`、`Claude Code Guide` 各自适合做什么 |
| specificity routing | 优先走更具体的宿主能力：已加载流程 → surfaced skill → `DiscoverSkills` → MCP resource → deferred tool → `ToolSearch` → 更宽 agent |
| 原生感输出 | 维持 Claude Code 风格的简洁、行动优先、结果导向表达 |
| 参数净化 | 继续处理 `Agent.model`、team 语义、worktree 语义等宿主敏感边界 |

---

## 它能带来什么

| 场景 | 你能感受到的变化 |
|---|---|
| Skill / workflow | 不再系统性压制已 surfaced 的 skill、slash command 或 workflow |
| 能力发现 | 更容易发现当前会话真实可用的宿主能力，而不是靠猜 |
| MCP | 更倾向优先使用已知 MCP resource、`ListMcpResources`、`ReadMcpResource` |
| ToolSearch | 更清楚地区分“已加载的 deferred tool”和“还需要 ToolSearch 加载的 deferred tool” |
| 多 agent | 更清楚什么时候该用 `Explore`、`Plan`、`General-Purpose`、`Claude Code Guide` |
| 计划与任务 | 非 trivial 任务更倾向先 `EnterPlanMode()`，只有真的需要任务盘时再进入 `Task*` |
| 团队语义 | 普通并行 worker 不再轻易误入 `TeamCreate` / teammate 路径 |
| 中文使用 | 中文会话更倾向持续中文输出，减少无故切英文和元叙述 |

---

## 它的路由优先级

hello2cc 当前最核心的行为，就是把第三方模型往**更具体、离当前会话更近**的宿主能力上推：

1. 已加载的 workflow / slash command / skill 连续体
2. 已 surfaced 的 skill
3. `DiscoverSkills`
4. 已知的 MCP resource
5. 已加载或已 surfaced 的 deferred tool
6. `ToolSearch`
7. 更宽的 `Agent` / `Plan`

这意味着：

- 如果当前会话已经加载过某个 workflow，就优先续跑它
- 如果当前回合已经 surfaced 了匹配 skill，就优先直接 `Skill`
- 如果已经知道具体 MCP resource，就优先直接读 resource，而不是重新泛搜一遍 MCP
- 如果某个 deferred tool 已经通过 ToolSearch 加载过，就优先直接调用，不再重复 ToolSearch

---

## 适合谁

如果你符合下面任一场景，`hello2cc` 会比较有价值：

- 你已经把 GPT、Kimi、DeepSeek、Gemini、Qwen 等模型映射进 Claude Code
- 你希望第三方模型更像 Opus 一样使用 Claude Code 的原生能力
- 你不想每一轮都手动提醒“去用 skill / MCP / Agent / ToolSearch”
- 你希望模型别把普通并行任务误判成 team workflow
- 你希望在已有 skill / workflow / MCP / plugin 的环境里，第三方模型也能更自然地发现和使用它们

---

## 它不做什么

`hello2cc` 不会：

- 接管你的 provider / gateway / API key / 账号能力
- 替宿主打开本来就没有暴露的工具
- 把第三方模型兼容成另一个 provider 层
- 压制宿主已经暴露出来的 skill / workflow / MCP / plugin 能力
- 覆盖高优先级的 `CLAUDE.md`、`AGENTS.md`、项目规则和用户明确要求
- 接管 CCSwitch / helloswitch 的模型映射职责
- 把 `Thinking` / 推理模型路由纳入自己的职责边界

它追求的是：

**静默增强原生感，而不是接管 Claude Code。**

---

## 快速开始

### 1）添加本地 marketplace

```bash
claude plugin marketplace add "D:\GitHub\dev\hello2cc"
```

### 2）安装插件

```bash
claude plugin install hello2cc@hello2cc-local
```

### 3）重新打开 Claude Code 会话

通常不需要你手动切 output style，也不需要再手动加载额外入口。

安装后默认会生效的内容：

- 主线程走 `hello2cc:native`
- 插件 output style 自动启用
- 原生 `Agent.model` / team / isolation 参数在需要时自动净化
- 第三方模型会更倾向按 Claude Code 当前真实暴露的宿主能力来行动

---

## 重装 / 清理旧版本 / 升级

如果你修改了本地仓库，或者想彻底清掉旧缓存，建议按下面顺序：

### 1）卸载旧插件

```bash
claude plugin uninstall --scope user hello2cc@hello2cc-local
```

### 2）移除旧 marketplace（推荐）

```bash
claude plugin marketplace remove hello2cc-local
```

### 3）重新添加 marketplace

```bash
claude plugin marketplace add "D:\GitHub\dev\hello2cc"
```

### 4）重新安装

```bash
claude plugin install hello2cc@hello2cc-local
```

### 5）建议重开会话或执行 `/reload`

---

## 与 CCSwitch / helloswitch 的关系

建议这样分工：

### 模型切换层负责

- 主模型映射
- Thinking / 推理模型映射
- `Opus / Sonnet / Haiku` 默认模型映射
- 第三方别名到 Claude 槽位的落点控制
- 代理链路、反代增强、工具协议兼容等

### hello2cc 负责

- 宿主能力图识别
- 路由优先级与能力 specificity
- 第三方模型对 Skill / workflow / MCP / ToolSearch / Agent 的使用习惯
- `Agent.model` 的宿主安全槽位处理
- team 语义和 worktree 语义净化

也就是说：

- **模型接入层解决“接得进来”**
- **hello2cc 解决“接进来以后怎么更像原生地工作”**

---

## 关于 `opus` 与 `opus(1M)`

如果你希望 Opus 家族最终落到 `opus(1M)`：

- 在 **CCSwitch / 你的模型映射层** 中，把 Opus 默认模型映射到 `opus(1M)`
- 在 **hello2cc** 里，仍然写宿主安全槽位：`opus`

hello2cc 可以识别：

- `opus`
- `opus(1M)`

但在真正写入 `Agent.model` 时，会归一化为：

- `opus`

原因很简单：

- hello2cc 只负责写宿主安全槽位
- 最终槽位落到哪个真实模型，应由 CCSwitch / helloswitch / provider 映射层决定

---

## 内建 Agent 的建议使用方式

| Agent | 适合什么 | 不适合什么 |
|---|---|---|
| `Explore` | 只读搜索、代码定位、广泛找入口 | 直接改文件、执行实现 |
| `Plan` | 只读规划、分阶段方案、改造路线 | 直接改文件、直接执行实现 |
| `General-Purpose` | 边界清晰的实现 / 修复 / 验证切片 | 过宽的开放式仓库探索 |
| `Claude Code Guide` | Claude Code / API / SDK / hooks / settings / MCP 使用问题 | 普通业务代码实现 |

如果是多 worker 场景，通常建议：

- 研究 / 定位切片 → `Explore`
- 规划 / 方案切片 → `Plan`
- 实现 / 修复 / 验证切片 → `General-Purpose`

---

## MCP / deferred tools / workflow 的推荐理解

### 如果已经知道 workflow

- 优先续跑已加载 workflow / slash command / skill
- 不要重新发现一遍相同流程

### 如果已经 surfaced 了 skill

- 优先 `Skill`
- 不要自己重写同一套流程

### 如果已经知道具体 MCP resource

- 优先 `ReadMcpResource`
- 不要先泛搜 MCP 面

### 如果只知道 MCP server，不知道 resource

- 优先 `ListMcpResources`

### 如果某个 deferred tool 已加载

- 直接调用
- 不要再重复 ToolSearch

### 如果只是知道“可能有工具”

- 再用 `ToolSearch`

---

## 推荐配置

### 方案 A：最省心

适合：你已经用 CCSwitch / gateway / 映射层把模型接好了，只想让行为更接近原生。

建议：

- `mirror_session_model = true`
- 其他模型覆盖项尽量留空

效果：

- 优先跟随当前会话模型语义
- 少量关键 Agent 路径在必要时镜像当前会话槽位
- 尽量保留 Claude Code 自身默认行为

### 方案 B：只改少数 Agent

适合：你只想调 `Guide / Explore / General-Purpose / Team` 等少数路径。

建议：

- `mirror_session_model = true`
- 按需填写 `guide_model`、`explore_model`、`general_model`、`team_model`
- 其他覆盖项留空

### 方案 C：统一设置默认 Agent 槽位

适合：你希望多数 Agent 稳定落在某个 Claude 槽位。

例如：

- `default_agent_model = opus`
- 或 `default_agent_model = inherit`

---

## 配置项说明

| 配置键 | 默认行为 | 说明 |
|---|---|---|
| `routing_policy` | `native-inject` | `native-inject` 会在需要时静默补 `Agent.model`；`prompt-only` 只做行为引导，不改工具输入 |
| `mirror_session_model` | `true` | 优先镜像当前 Claude Code 会话模型语义 |
| `default_agent_model` | 空 | 原生 Agent 的统一默认槽位，推荐填 `inherit / opus / sonnet / haiku` |
| `primary_model` | 空 | 高能力原生 Agent 的显式 Claude 槽位 |
| `subagent_model` | 空 | 未显式设模的原生 Agent / teammate 的统一槽位 |
| `guide_model` | 空 | `Claude Code Guide` 的显式槽位 |
| `explore_model` | 空 | `Explore` 的显式槽位 |
| `plan_model` | 空 | `Plan` 的显式槽位 |
| `general_model` | 空 | `General-Purpose` 的显式槽位 |
| `team_model` | 空 | 带 `team_name` 的 teammate 路径显式槽位 |
| `compatibility_mode` | `full` | 与其他 orchestration 插件冲突时可切 `sanitize-only`，只保留参数净化 |

---

## 关于 `compatibility_mode = sanitize-only`

如果你同时启用了其他也会大量注入 hooks / additionalContext / system-reminder 的插件，推荐尝试：

```json
{
  "compatibility_mode": "sanitize-only"
}
```

启用后：

- 保留 `Agent.model`、team 语义、worktree 语义净化
- 不再继续注入 `SessionStart / UserPromptSubmit / SubagentStart` 附加上下文

适合多插件共存环境。

---

## 常见问题

### 安装后还需要手动切 output style 吗？

通常不需要。

### hello2cc 会不会阻止 skill / plugin / MCP？

不会。

当前方向恰恰相反：它会尽量把第三方模型往宿主已经暴露出来的这些能力上推。

### hello2cc 会不会替我打开本来不存在的工具？

不会。

它只能帮助模型更好地使用**已经暴露**的宿主能力，不能替宿主创造能力。

### 是否建议把第三方模型别名直接写到 hello2cc 配置里？

不建议。

更推荐：

- 模型映射层处理真实模型别名
- hello2cc 只写宿主安全槽位

### 普通并行任务为什么不建议默认走 team？

因为普通 worker 与持久团队是两套不同语义。

普通并行更适合：

- 多个原生 `Agent` worker 并行
- 完成后回传结果

只有真的需要持久团队身份与团队编排时，才建议 `TeamCreate`

### 如果后面用 helloswitch 增强了代理，让第三方模型更完整支持 Claude Code 工具协议，会和 hello2cc 冲突吗？

不会。

hello2cc 不会挡住真实可用的宿主工具链路；相反，它会尽量让第三方模型优先走这些真实暴露出来的路径。

---

## 本地验证

```bash
npm run validate
npm test
npm run check
npm run test:real
```

说明：

- `npm run validate`：校验 manifest、hooks、settings、脚本结构
- `npm test`：运行自动化测试
- `npm run check`：组合执行 `validate + test`
- `npm run test:real`：调用本机 Claude Code CLI 做真实回归

---

## 许可证

Apache-2.0
