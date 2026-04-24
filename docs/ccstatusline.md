# ccstatusline 兼容桥接

启用 `2cc` 接入第三方模型后，Claude Code 的 `StatusLine` 输入偶尔会把 `context_window.current_usage`、`used_percentage`、`total_input_tokens`、`total_output_tokens` 传成 `0`。`ccstatusline` 会优先使用这些字段，因此即使 transcript 里已有真实 usage，进度条也可能一直显示 `0`。

`2cc` 不能通过插件自动覆盖已有 `statusLine.command`。当前 Claude Code 插件设置合并只允许插件写入 `agent`，插件 hook 列表也没有 `StatusLine` 事件。因此兼容方式是在 `statusLine.command` 中使用 `2cc` 提供的桥接命令。

## 推荐配置

将 Claude Code settings 里的 `statusLine.command` 改为：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"C:/Users/HP/OneDrive/Desktop/新建文件夹/2cc/scripts/ccstatusline-bridge.mjs\""
  }
}
```

默认下游命令是：

```bash
npx -y ccstatusline@latest
```

如果需要使用其他下游命令，可以在桥接脚本后追加：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"C:/Users/HP/OneDrive/Desktop/新建文件夹/2cc/scripts/ccstatusline-bridge.mjs\" bunx ccstatusline@latest"
  }
}
```

也可以通过环境变量覆盖：

```bash
HELLO2CC_CCSTATUSLINE_COMMAND="bunx ccstatusline@latest"
```

## 桥接行为

桥接脚本会读取 Claude Code 传给 `StatusLine` 的 JSON，通过 `transcript_path` 汇总主会话和已引用 subagent transcript 的 usage，并识别 `agentId` / `agent_id` / `agent.id` 与 `agentTranscriptPath` / `agent_transcript_path`。只有 `context_window` 关键字段缺失或为 `0` 时才回填，避免覆盖 Claude Code 原生可用的非零统计。回填后的 JSON 会交给下游 `ccstatusline` 命令，不修改 Claude Code 或 `ccstatusline` 源码。
