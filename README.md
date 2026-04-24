# 2cc

Personal local Claude Code plugin for CCSwitch-backed third-party models.

`2cc` does not manage model accounts, replace CCSwitch, or publish to npm. CCSwitch owns the real model mapping. `2cc` stays at the Claude Code plugin layer and keeps output style, tool semantics, agent/team/task input normalization, failure debounce, and context boundaries closer to native Claude Code behavior.

## Local install

```bash
git clone https://github.com/li1679/hello2cc.git 2cc
cd 2cc
claude plugins marketplace add "$(pwd)"
claude plugins install 2cc@2cc-local
```

On Windows PowerShell, use the local repository path:

```powershell
claude plugins marketplace add "C:\Users\HP\OneDrive\Desktop\新建文件夹\2cc"
claude plugins install 2cc@2cc-local
```

Restart Claude Code after installing, or run `/reload-plugins`.

## What this fork changes

`2cc` aims to reduce internal process leakage, stale checklist repetition, and generic misrouting. Ordinary questions should not keep using a previous plan or checklist format. Continuity stays only when a real active plan, team, task board, or failure recovery path exists.

## CCSwitch boundary

Keep real model routing in CCSwitch. In `2cc`, prefer Claude Code-native slots such as `inherit`, `opus`, `sonnet`, and `haiku`; do not put third-party model aliases directly into `Agent.model`.

## Local validation

```bash
npm run check
```

This validates the local plugin and tests. It is not an npm publish flow.
