# 更新日志

## 0.3.0 - 2026-04-02

- 新增更细的宿主能力图：现在会从 transcript 中识别 surfaced skills（含描述）、已加载的 slash command / skill 参数、`local_workflow` 的 `workflow_name`、已 surfaced / 已加载的 deferred tools，以及已观测到的 MCP resources
- 升级会话引导与路由策略，按更具体的能力优先级决策：已加载 workflow / skill 连续体 → 已 surfaced 的 skill → `DiscoverSkills` → 已知 MCP resource → 已加载 / 已 surfaced 的 deferred tool → `ToolSearch` → 更宽的 agent 路径
- 补齐不同内建 agent 子类型的 tool surface 映射：`Explore` 明确为只读搜索面，`Plan` 明确为只读规划面，`General-Purpose` 明确为全工具面，`Claude Code Guide` 明确为本地读搜 + `WebFetch` + `WebSearch`
- 强化 MCP resources / deferred tools / workflow 的 specificity 路由，第三方模型在已知资源、已知 workflow、已知 deferred tool 的情况下，会更倾向直接继续或直接调用，而不是重新泛化到更宽的发现路径
- 补充对应回归测试，并将 release notes 模板与历史 release 正文统一切换为中文

## 0.2.10 - 2026-04-02

- 新增基于 transcript 的 skill surface 感知，hello2cc 现在可以识别 surfaced 的 `skill_discovery` 结果与已加载的 skill / workflow command tag，而不再只依赖粗粒度的工具可用性判断
- 升级路由与会话引导，使用更丰富的宿主信号：当已经存在匹配的 surfaced skill 时，hello2cc 会优先直接续跑或直接调用，而不是立刻退回到更宽的发现流程
- 明确区分“已 surfaced 的 skills”“已加载的 workflows”“`DiscoverSkills`”与“`ToolSearch`”之间的职责边界，让第三方模型按能力 specificity，而不是按泛化 workflow 关键词来选择路径
- 扩充回归测试，覆盖 transcript 派生的 surfaced skill 与已加载 workflow 连续体，确保新的 host-surface 行为稳定

## 0.2.9 - 2026-04-02

- 修正 hello2cc 之前过窄的 native-first 偏向，正式收敛为 host-surface-first：第三方模型现在会被提醒尊重 Claude Code 当前真实暴露的全部能力面，而不是只偏向少数原生工具和 agent
- 新增显式的 `Skill` / `DiscoverSkills` 能力识别，以及配套的 session / route guidance，让 surfaced skill、slash-command workflow、plugin workflow 成为一等路径，不再被 `ToolSearch` / `Plan` / `Agent` 系统性压制
- 明确 discovery 分层边界：已知匹配流程走 `Skill`，需要发现 skill / workflow 时走 `DiscoverSkills`，需要发现工具 / MCP / 权限边界时走 `ToolSearch`
- 同步更新 output style、subagent guidance、验证规则与回归测试，确保 hello2cc 不再把“避免使用 skill”编码成成功条件
- 新增基于 `CHANGELOG.md` 的 deterministic GitHub release notes 生成逻辑；同时补齐所有历史 release 的空正文或只有 `Full Changelog` 的壳正文

## 0.2.8 - 2026-04-02

- 为最新 / 实时信息任务加入更柔和的原生 `WebSearch` 引导：hello2cc 会鼓励优先走宿主自带的搜索路径，但不会假装插件本身能创造不存在的联网能力
- 新增以真实性为中心的代理链路提示：在自定义 `ANTHROPIC_BASE_URL` 会话中，仍鼓励优先尝试原生 `WebSearch`，但如果出现 `Did 0 searches`、没有链接或没有搜索命中，就必须按“并未真实搜索”处理，而不是把记忆包装成联网结果
- 补充回归测试，确保 hello2cc 不会因为存在自定义代理就硬禁用 `WebSearch`，同时也不会放松结果真实性边界

## 0.2.7 - 2026-04-02

- 新增真正的 `default_agent_model` 配置项，用户现在可以统一设置一个宿主安全的默认 Agent 槽位，而不必滥用每个 Agent 的单独 override
- 将 `opus(1M)` 归一化为宿主安全的 `opus` Agent 槽位，同时把最终 Opus 家族实际落点继续交给外部模型映射层（例如 CCSwitch）
- 明确把 `Thinking` / 推理模型路由排除在 hello2cc 的职责边界之外，让插件继续聚焦于原生 Agent 行为，而不是去重复 provider 或会话级模型布线
- 新增持久化的 `wantsWorktree` 意图跟踪，以及 `PreToolUse(Agent)` 的 isolation 净化逻辑，使普通并行 worker 不再意外继承 `worktree` 隔离，除非用户明确要求
- 新增 `compatibility_mode = sanitize-only`，让 hello2cc 在与其他重度 hooks / additionalContext 插件共存时只保留 `Agent` 参数净化，关闭额外 SessionStart / UserPromptSubmit / SubagentStart 覆盖层
- 扩充回归测试，覆盖默认 Agent 模型、`opus(1M)` 归一化、worktree 隔离净化与 sanitize-only 兼容模式
- 刷新 README，重点转向实际使用方法、安装升级、配置说明与 CCSwitch 搭配建议，而不再展开实现细节

## 0.2.6 - 2026-04-01

- 修复普通对话场景下的 agent 路径：hello2cc 现在会在非真实团队工作流中移除隐式 teammate 字段，避免第三方模型把普通 subagent 工作误触发成 `team=main` / `team=default` 的 teammate 生成
- 阻止 assistant 模式中的占位团队名（如 `main`、`default`）在真实 `TeamCreate` 建立前被当作可复用团队身份使用
- 收紧原生 guidance 与输出风格，使可见叙述更贴近用户当前语言，减少中文会话中冗长的英文切换与元叙述
- 新增针对保留团队名、显式 team gating 与新语言 / 风格策略的回归测试，避免 issue #6 族问题回归

## 0.2.5 - 2026-04-01

- 修复 Claude Code `2.1.76+` 下的原生 `Agent.model` 注入兼容性问题：hello2cc 现在只会写入宿主安全的 `opus / sonnet / haiku` Agent 槽位，而不会再传递新版 Claude Code 会拒绝的第三方别名
- 新增槽位归一化与回退逻辑，使 `claude-opus-*` / `claude-sonnet-*` 这类完整 Claude 模型 ID 在需要注入原生 Agent override 时仍能正确折叠回宿主安全槽位
- 更新插件配置文案与 README，明确职责边界：第三方别名应留在 provider / gateway / CCSwitch 层映射，hello2cc 的 model override 字段只应填写原生 Claude 槽位
- 补充针对不受支持的 Agent override 别名、槽位回退行为与支持槽位强制归一化的回归测试，避免 issue #4 回归
- 新增真实 Claude CLI 的本地安装 smoke coverage，持续守护 issue #3 报告的 self-marketplace 安装 / reload 路径在 `2.1.76+` 上的可用性

## 0.2.4 - 2026-04-01

- 强化 `scripts/claude-real-regression.mjs`，真实会话检查现在会自动识别 Claude Code CLI 中 `plugin` 与 `plugins` 两种命令拼写，而不再假定只有一种形式
- 新增 Windows 下对 PATH 命令解析的回退执行逻辑，当 `APPDATA\\npm\\claude.ps1` 缺失时，本地真实回归也能继续执行，降低 shell 与安装布局差异带来的脆弱性
- 在临时启用插件进行真实回归后，恢复原始插件启用 / 禁用状态，避免测试结束后把用户的 Claude Code 插件状态遗留在变更后的状态
- 保留真实 Claude CLI 的原始失败原因，并在恢复失败时把恢复失败附加输出，显著提升排障清晰度，同时不再复活已删除的旧兼容文件
- 新增针对 Claude CLI 缺失、单数 plugin 命令支持、Windows / PATH 回退与 restore-error 报告的自动化覆盖

## 0.2.3 - 2026-04-01

- 删除旧的 `scripts/notify.mjs` 兼容 shim 及其测试，使公开插件包不再携带遗留通知 / hook bridge 包袱
- 收紧主线程 agent、输出风格与路由覆盖层，走更严格的 native-first 策略：不再保留 `TodoWrite` fallback 文案、不再保留 web fallback 文案，也不再向模型注入“能力撤回”类提示
- 移除面向模型的 transcript 级传输诊断，hello2cc 不再把代理 / 兼容性评论直接注入正在运行的 Claude Code 会话
- 将过大的 native-context orchestration 拆分为更聚焦的 guidance 模块，使传输安全逻辑更易维护，同时保持相同的对外插件行为

## 0.2.2 - 2026-04-01

- 重新对齐 hello2cc 的多 worker 引导与 Claude Code 原生 worker 流：普通 research / implement / verify 轮次现在优先并行多个 `Agent`，而不是过度推荐 `TeamCreate`
- 新增明确引导：等待 worker 完成通知，并使用 `SendMessage` / `TaskStop` 进行续派或纠偏，而不是把普通 worker 的默认结果读取误导成 `TaskOutput` 轮询
- 保留对显式 checklist / task-board 请求的原生任务盘支持，同时停止把 `TaskCreate` / `TaskList` / `TaskUpdate` 推成所有复杂任务的默认路径
- 更新默认 main-agent overlay、output style、route heuristics 与回归测试，使第三方模型更接近 Claude Code 原生协调者行为，同时不干扰更高优先级的仓库规则

## 0.2.1 - 2026-04-01

- 降低 hello2cc 在输出层的干预强度，明确用户指令、Claude Code 宿主规则以及仓库 / 用户级 `CLAUDE.md` 或 `AGENTS.md` 始终高于 hello2cc 的覆盖层
- 移除之前偏向 ASCII 的展示倾向，恢复为 Markdown 优先表格，只有在纯文本布局明显更合适时才退回
- 收紧主线程与 subagent 的覆盖层，让 hello2cc 只增强原生工具与 agent 的使用，而不替换项目自带 wrapper、命令路由或品牌化响应格式
- 提升插件版本号，使 Claude Code 安装时能拿到新的缓存条目，而不再继续复用旧的 `0.2.0` 缓存载荷

## 0.2.0 - 2026-04-01

- 将 hello2cc 重构为更关注能力感知的原生对齐模型，让会话引导优先依据实际观测到的工具与 agent 暴露面，而不是依赖宽泛关键词触发路由
- 扩展 native-first 路由，覆盖 `AskUserQuestion`、`SendMessage`、`TeamDelete`、`TaskGet`、`TodoWrite` fallback、`ListMcpResources`、`ReadMcpResource` 以及仅在显式请求时才启用的 `EnterWorktree`
- 收紧 prompt intent 分类，减少过宽的关键词启发式，尤其是在决策路由与 worktree 路由上，并把更多多线检测转为结构信号
- 缩小过宽的 agent alias 归一化范围，使模型注入更贴近真实宿主 agent 身份，而不是依赖模糊别名
- 强化任务与 subagent 完成质量门槛，接受更多基于结构的完成证据（列表、路径、命令），而不再只依赖措辞线索
- 刷新默认 main-agent overlay、forced output style guidance、README 与测试覆盖，以匹配更安静、更 capability-aware 的 native-first 行为

## 0.1.3 - 2026-03-31

- 在 `.github/workflows/publish.yml` 中新增 GitHub Actions 的 npm 发布流水线，与 helloloop 的发布流程保持一致，同时支持 tag 触发发布与手动 dispatch
- 在 `package.json` 中补充 npm publish 元数据，并在 README 中加入 release 文档，同时兼容 `NPM_TOKEN` 与 trusted publishing 两类自动发布方式
- 修复 GitHub Actions 发布工作流，使 npm token 检测不再依赖 `if:` 表达式里不支持的 `secrets.*` 判断，避免此前出现零 job 失败的工作流

## 0.1.2 - 2026-03-31

- 新增首个自动化 npm 发布工作流 `.github/workflows/publish.yml`，同时覆盖 tag 触发发布与手动 dispatch 入口
- 更新包元数据与 README 的发版说明，使 npm 包与 Claude Code 插件 manifest 在发版准备阶段保持版本一致
- 在补齐 publish 自动化与相关 release 文档后，切出独立的 `0.1.2` 版本

## 0.1.1 - 2026-03-31

- 将更多 Claude Code 宿主侧的任务引导重建进插件强制输出风格中，使第三方模型即使在 output style 覆盖了部分宿主 prompt 组合时，也能保持更强的原生习惯
- 收紧默认 native 主 agent、route 与 subagent 覆盖层，优先专用工具而不是 shell，并行独立工具调用，并更诚实地报告验证状态
- 新增 ToolSearch readiness 诊断，使 hello2cc 能区分“提示模型使用 ToolSearch”与“Claude Code 宿主本轮真的暴露了 ToolSearch”，并为第三方 gateway 场景给出更明确的补救提示
- 新增兼容型 `scripts/notify.mjs` shim，使旧的本地 hook / notification-program 路径即使仍引用 `notify.mjs inject`、`notify.mjs route`、`notify.mjs stop` 或 `codex-notify`，也不会立刻失效
- 提升 transcript / session-state 捕获能力，让 hook guidance 除了记住镜像会话模型外，也能记住实际观测到的工具与 agent 暴露情况
- 扩展 validate、单元测试与真实回归诊断，包括当 Claude Code 在 plugin hooks 运行前就拒绝当前第三方模型别名时，给出更清晰的失败报告

## 0.1.0 - 2026-03-31

- 将 hello2cc 提升到首个 `0.1.0` 里程碑，标志核心架构已经足以支撑 alpha 阶段迭代，而不再只是 `0.0.x` 级别的补丁实验
- 保留此前版本引入的官方插件路径架构：namespaced 默认主 agent、`force-for-plugin` output style、最小化原生 Agent model 注入，以及真实 Claude Code 回归覆盖
- 保持更清晰的默认 main-agent runtime id `hello2cc:native`，让 hello2cc 处于 native-first 模式的语义更直观，同时不锁定主线程模型

## 0.0.10 - 2026-03-31

- 将默认插件主 agent 的 runtime id 从 `hello2cc:main` 重命名为 `hello2cc:native`，让当前的 native-first 角色语义更自解释，同时继续保持 `model: inherit`
- 将插件默认 agent 设置切换到真正的 namespaced runtime id `hello2cc:native`，与 Claude Code 的 plugin agent loader 保持一致
- 将插件 output style 切换到 Claude Code 官方支持的 `force-for-plugin` 路径，从而无需修改用户 `settings.json` 就能启用 native-first 风格
- 移除自动写入用户 settings 的 output-style bootstrap 逻辑及相关运行时脚本，改为完全依赖宿主支持的插件 output style 机制
- 将 `Agent.model` 注入范围收窄到真正需要纠偏的位置（`Claude Code Guide`、`Explore` 与显式 override 场景），默认保留 `Plan`、`general-purpose` 与自定义 agent 的原生 inherit 行为
- 新增 `ConfigChange` 处理，在配置变更时清空缓存的 session model 状态，避免配置切换后残留旧的会话模型镜像
- 更新 validate、单元测试与真实会话回归检查，覆盖 namespaced plugin agents 与 forced plugin output styles

## 0.0.9 - 2026-03-31

- 在后续 `hello2cc:native` 重命名前，先完成首个公开 native-first 默认值组合，收敛默认主线程 agent 与打包 settings 到更安静的基线
- 简化插件打包表面，移除旧的 output-style bootstrap runtime，收紧 manifest / settings 默认值，并稳定打包后的 hooks 布局
- 扩展 route、session-state、回归与 validate 覆盖，确保 transcript 驱动的 session-model 发现与 native-first prompt overlays 在真实 Claude Code 会话里稳定工作

## 0.0.7 - 2026-03-31

- 新增默认插件 `settings.json`，激活 `main` 作为主线程 agent，并使用 `model: inherit` 作为更安静、更接近原生的默认基线
- 新增 `agents/main.md`，让主线程在不完全依赖 output style 的情况下，也能获得更强的 native-first 路由、ToolSearch-first 姿态与更友好的表格输出建议
- 新增基于 transcript 的 session context 发现逻辑，使原生 `Agent.model` 注入即使在 hook payload 不直接暴露当前会话模型别名时，也能从真实 Claude Code transcript 中恢复它
- 扩展回归测试，验证 transcript 驱动的模型镜像能力，并确保打包插件会导出新的默认主 agent

## 0.0.6 - 2026-03-31

- 新增当前会话模型镜像能力，使缺失原生 `Agent.model` 时能够继承当前 Claude Code 会话模型别名（例如 `opus`），而不再依赖硬编码默认值
- 新增自动化的用户级 `outputStyle` bootstrap，支持 `user-if-unset` / `force-user` / `off` 策略，并在 `SessionStart` 时按插件版本执行一次
- 将 orchestration 重构为更小的运行时 helper，拆分 hook I/O、session state、plugin data、native routing context 与受控 output style 逻辑
- 扩展路由与 subagent 引导，在清单、任务矩阵、验证摘要与取舍对比场景中更倾向使用清晰表格
- 新增会话模型镜像与受控 output-style bootstrap 的自动化测试
- 放宽真实会话回归要求：只验证稳定的原生能力暴露，而不再强制要求用户环境事先已经选择特定 output style

## 0.0.5 - 2026-03-30

- 新增对 `General-Purpose`、`TeamCreate`、`TaskCreate`、`TaskUpdate`、`TaskList` 与面向 MCP 工作流的更细粒度 native routing
- 新增 `SubagentStart` 引导，覆盖内建 `Explore`、`Plan` 与 `general-purpose` agents
- 新增 `SubagentStop` / `TaskCompleted` 质量守卫，要求原生 teammate 在结束前返回具体总结、精确路径与完成证据
- 新增 `scripts/claude-real-regression.mjs` 与 `npm run test:real`，用于本地真实 Claude Code 会话回归检查
- 让 `UserPromptSubmit` 路由稳健支持真实 Claude Code 会话里出现的结构化 prompt payload
- 保持 orchestration 层与当前已安装 Claude Code runtime 的兼容性，避免使用宿主尚不支持的 hook key

## 0.0.2 - 2026-03-30

- 从核心插件中移除所有内置 `skills/`，使 `hello2cc` 默认成为完全无内嵌 skill 的核心插件
- 停止在 `.claude-plugin/plugin.json` 中暴露 `skills` 字段，并在 validate 中强制校验这一点
- 简化运行时 prompt 与 output style，使插件不再提及手动 skill fallback
- 更新测试、打包元数据与中文 README，使其与“无内嵌 skill 的 native-first 架构”保持一致

## 0.0.1 - 2026-03-30

- 将 `hello2cc` 切换为 native-first 路由模型，而不是 skill-first prompt routing
- 修复 `PreToolUse(Agent)` 的 model 注入，使其使用 Claude Code 文档化的权限字段
- 新增一次性可选的 `hello2cc Native` output style，用于安静且持久的格式行为
- 新增自动化校验与单元测试，覆盖路由与模型注入
- 为公开发布与 GitHub 分发重写 `README.md`
