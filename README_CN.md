# 2cc

个人本地 Claude Code 插件，用来让通过 CCSwitch 接入的第三方模型更接近 Claude Code 原生工作方式。

`2cc` 不接管模型账号，不替代 CCSwitch，不发布 npm。CCSwitch 负责真实模型映射；`2cc` 只在 Claude Code 插件层做输出风格、工具语义、agent/team/task 参数归一、失败防抖和上下文收口。

## 本地安装

```bash
git clone https://github.com/li1679/hello2cc.git 2cc
cd 2cc
claude plugins marketplace add "$(pwd)"
claude plugins install 2cc@2cc-local
```

Windows PowerShell 可以把 `$(pwd)` 换成仓库绝对路径：

```powershell
claude plugins marketplace add "C:\Users\HP\OneDrive\Desktop\新建文件夹\2cc"
claude plugins install 2cc@2cc-local
```

安装后重启 Claude Code，或执行 `/reload-plugins`。

## 这一版重点

`2cc` 的目标是少露内部流程、少复读清单、少误路由。普通问题不应该因为上一轮出现过计划或 checklist，就继续套用旧格式。只有真实 active plan、team、task board 或失败恢复还存在时，才保留连续体提示。

## 推荐配置

真实模型落点继续放在 CCSwitch。`2cc` 配置里优先使用 `inherit`、`opus`、`sonnet`、`haiku` 这些 Claude Code 原生槽位，不把第三方模型别名直接写进 `Agent.model`。

## 本地验证

```bash
npm run check
```

这个命令只验证本地插件结构和测试，不代表发布 npm。

## ccstatusline 桥接

如果 Claude Code 的 `StatusLine` payload 把 usage 字段传成 `0`，可以使用 `scripts/ccstatusline-bridge.mjs` 从 transcript 回填。配置示例在 `docs/ccstatusline.md`。
