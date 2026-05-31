# Claude Code Hooks 配置指南

## 安装步骤

### 1. 启动 Desktop Pet 应用

确保 Desktop Pet 应用正在运行，HTTP 服务器监听在 `http://localhost:10425`。

验证服务健康状态:
```bash
curl -X POST http://localhost:10425/health
# 应返回: OK
```

### 2. 配置 Claude Code Hooks

在 `~/.claude/settings.json` (全局) 或项目 `.claude/settings.json` 中添加:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:10425/tf-pretooluse"
          }
        ]
      }
    ]
  }
}
```

### 3. 验证配置

在 Claude Code 中运行:
```
/hooks
```

确认 `PreToolUse` 旁边显示已配置 1 个 hook。

## 工作流程

1. Claude Code 执行工具前，发送 POST 请求到 `/tf-pretooluse`
2. Desktop Pet 收到请求，显示审批弹窗
3. 用户选择 "Approve" (允许) 或 "Deny" (拒绝)
4. Desktop Pet 返回决策 JSON 给 Claude Code
5. Claude Code 根据决策执行或阻止工具

## 决策说明

| Decision | 行为 |
|----------|------|
| `allow` | 跳过权限提示，直接执行工具 |
| `deny` | 阻止工具调用，Claude 收到拒绝原因 |
| `ask` | 照常显示权限提示 (Desktop Pet 不干预) |

## 调试

查看 Desktop Pet 日志:
- Tauri 应用日志输出到 stderr

查看 Claude Code hook 触发:
```
/debug
```
然后在另一个终端:
```bash
tail -f /tmp/claude.log
```

## 扩展

预留的其他 Hook 类型 (暂未实现):
- `PostToolUse` - 工具执行后
- `Notification` - 通知事件
- `UserPromptSubmit` - 用户提交提示

如需添加，参考相同模式扩展 `http_server.rs`。
