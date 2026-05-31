# CC Touch Fish - 技术规格文档

## 项目概述

跨平台桌面宠物应用程序，极致性能和低资源占用，与 Claude Code 深度联动。

## 技术栈

- **框架**: Tauri 2.0
- **后端**: Rust
- **前端**: React 18 + TypeScript + Vite
- **HTTP 服务器**: Axum (端口 10425)
- **状态管理**: Zustand
- **UI**: 轻量级内联样式

## 核心功能

### 1. 桌面宠物基础功能
- [ ] 窗口透明与点击穿透
- [ ] 基础管理面板 (更换宠物、透明度、开关穿透)
- [ ] 内置特效与彩蛋系统

### 2. Claude Code Hooks 联动
- [x] PreToolUse HTTP Hook (`/tf-pretooluse`)
- [ ] HTTP 服务器健康检查 (`/health`)
- [ ] 审批弹窗 GUI
- [ ] 审批决策回传

## 目录结构

```
cc-touch-fish/
├── src/                          # React 前端
│   ├── components/
│   │   ├── PetCanvas.tsx        # 宠物画布
│   │   ├── AdminPanel.tsx       # 管理面板
│   │   └── ApprovalModal.tsx    # 审批弹窗
│   ├── stores/
│   │   └── petStore.ts          # Zustand 状态管理
│   ├── styles/
│   │   └── styles.css
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                   # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── http_server.rs       # Axum HTTP 服务器
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## HTTP API

### PreToolUse Hook
- **端点**: `POST http://localhost:10425/tf-pretooluse`
- **用途**: Claude Code 工具执行前触发

**输入**:
```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /tmp" }
}
```

**输出**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "..."
  }
}
```

### Health Check
- **端点**: `POST http://localhost:10425/health`
- **用途**: 服务健康检查

## 验证计划

1. **HTTP 服务器测试**: `curl -X POST http://localhost:10425/health`
2. **Claude Hook 配置测试**: 配置 `~/.claude/settings.json` 后运行 `/hooks`
3. **PreToolUse 测试**: 执行需要审批的操作，验证 GUI 弹窗
4. **性能测试**: 内存 < 50MB, CPU < 5% (idle)
