use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};

#[derive(Debug, serde::Serialize)]
pub struct HookSettings {
    pub auto_approve_countdown: i32,
    pub deny_countdown: i32,
}

#[tauri::command]
pub fn get_hook_settings(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
) -> Result<HookSettings, String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT auto_approve_countdown, deny_countdown FROM hook_settings WHERE id = 1"
    ).map_err(|e| e.to_string())?;

    let settings = stmt.query_row([], |row| {
        Ok(HookSettings {
            auto_approve_countdown: row.get(0)?,
            deny_countdown: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn update_hook_settings(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    auto_approve_countdown: Option<i32>,
    deny_countdown: Option<i32>,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    if let Some(cd) = auto_approve_countdown {
        conn.execute(
            "UPDATE hook_settings SET auto_approve_countdown = ? WHERE id = 1",
            rusqlite::params![cd],
        ).map_err(|e| e.to_string())?;
    }
    if let Some(cd) = deny_countdown {
        conn.execute(
            "UPDATE hook_settings SET deny_countdown = ? WHERE id = 1",
            rusqlite::params![cd],
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct HookCommand {
    pub id: i64,
    pub command_pattern: String,
    pub auto_approve: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct HookTool {
    pub id: i64,
    pub tool_name: String,
    pub auto_approve: bool,
    pub commands: Vec<HookCommand>,
}

#[tauri::command]
pub fn get_hook_rules(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
) -> Result<Vec<HookTool>, String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let mut tools: Vec<HookTool> = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT id, tool_name FROM hook_tools ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (tool_id, tool_name) = row.map_err(|e| e.to_string())?;

        let mut cmd_stmt = conn.prepare(
            "SELECT id, command_pattern, auto_approve FROM hook_commands WHERE tool_id = ?"
        ).map_err(|e| e.to_string())?;

        let commands: Vec<HookCommand> = cmd_stmt.query_map([tool_id], |row| {
            Ok(HookCommand {
                id: row.get(0)?,
                command_pattern: row.get(1)?,
                auto_approve: row.get::<_, i32>(2)? == 1,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        // tool's auto_approve is true only if ALL commands are auto_approve
        let auto_approve = if commands.is_empty() {
            false
        } else {
            commands.iter().all(|c| c.auto_approve)
        };

        tools.push(HookTool {
            id: tool_id,
            tool_name,
            auto_approve,
            commands,
        });
    }

    Ok(tools)
}

#[tauri::command]
pub fn add_hook_tool(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    tool_name: String,
) -> Result<i64, String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    // Check if tool already exists
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM hook_tools WHERE tool_name = ?",
        rusqlite::params![tool_name],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if exists > 0 {
        return Err("工具已存在".to_string());
    }

    conn.execute(
        "INSERT INTO hook_tools (tool_name) VALUES (?)",
        rusqlite::params![tool_name],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn remove_hook_tool(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    tool_id: i64,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    // Delete commands first (cascade should handle this but be explicit)
    conn.execute("DELETE FROM hook_commands WHERE tool_id = ?", rusqlite::params![tool_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM hook_tools WHERE id = ?", rusqlite::params![tool_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn add_hook_command(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    tool_id: i64,
    command_pattern: String,
) -> Result<i64, String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    // Truncate to 50 chars
    let pattern = command_pattern.chars().take(50).collect::<String>();

    // Check if command pattern already exists for this tool
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM hook_commands WHERE tool_id = ? AND command_pattern = ?",
        rusqlite::params![tool_id, pattern],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    if exists > 0 {
        return Err("命令前缀已存在".to_string());
    }

    conn.execute(
        "INSERT INTO hook_commands (tool_id, command_pattern, auto_approve) VALUES (?, ?, 0)",
        rusqlite::params![tool_id, pattern],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn remove_hook_command(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    command_id: i64,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute("DELETE FROM hook_commands WHERE id = ?", rusqlite::params![command_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_tool_auto_approve(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    tool_id: i64,
    auto_approve: bool,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let value = if auto_approve { 1 } else { 0 };
    conn.execute(
        "UPDATE hook_commands SET auto_approve = ? WHERE tool_id = ?",
        rusqlite::params![value, tool_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_command_auto_approve(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    command_id: i64,
    auto_approve: bool,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let value = if auto_approve { 1 } else { 0 };
    conn.execute(
        "UPDATE hook_commands SET auto_approve = ? WHERE id = ?",
        rusqlite::params![value, command_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_hook_tool_name(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    tool_id: i64,
    tool_name: String,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "UPDATE hook_tools SET tool_name = ? WHERE id = ?",
        rusqlite::params![tool_name, tool_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn update_hook_command_pattern(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    command_id: i64,
    command_pattern: String,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let pattern = command_pattern.chars().take(50).collect::<String>();
    conn.execute(
        "UPDATE hook_commands SET command_pattern = ? WHERE id = ?",
        rusqlite::params![pattern, command_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct AutoApproveCheckResult {
    pub should_auto_approve: bool,
    pub matched: bool,
}

#[tauri::command]
pub fn check_auto_approve(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    tool_name: String,
    command: String,
) -> Result<AutoApproveCheckResult, String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    // Find the tool
    let mut stmt = conn.prepare(
        "SELECT id FROM hook_tools WHERE tool_name = ?"
    ).map_err(|e| e.to_string())?;

    let tool_id: Option<i64> = stmt.query_row([&tool_name], |row| row.get(0)).ok();

    if let Some(tid) = tool_id {
        // Check if any command matches
        let mut cmd_stmt = conn.prepare(
            "SELECT command_pattern, auto_approve FROM hook_commands WHERE tool_id = ?"
        ).map_err(|e| e.to_string())?;

        let command_prefix = command.chars().take(50).collect::<String>();

        let rows = cmd_stmt.query_map([tid], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? == 1))
        }).map_err(|e| e.to_string())?;

        for row in rows {
            if let Ok((pattern, auto_approve)) = row {
                if command_prefix.starts_with(&pattern) {
                    return Ok(AutoApproveCheckResult {
                        should_auto_approve: auto_approve,
                        matched: true,
                    });
                }
            }
        }
    }

    Ok(AutoApproveCheckResult {
        should_auto_approve: false,
        matched: false,
    })
}

#[tauri::command]
pub fn set_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_ignore_cursor_events(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app() {
    // Try to unmount hook if configured
    if let Some(home) = dirs::home_dir() {
        let config_path = home.join(".claude").join("settings.json");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                if content.contains("http://localhost:10425/tf-") {
                    let _ = unmount_hook();
                }
            }
        }
    }
    std::process::exit(0);
}

#[tauri::command]
pub async fn submit_approval(
    state: tauri::State<'_, Arc<Mutex<crate::PreToolUseState>>>,
    approved: bool,
) -> Result<(), String> {
    let mut state = state.lock().await;
    if let Some(tx) = state.response_tx.take() {
        let _ = tx.send(approved);
    }
    Ok(())
}

#[tauri::command]
pub fn show_bubble_window(app: AppHandle) -> Result<(), String> {
    tracing::info!("show_bubble_window called");

    let gs = app.global_shortcut();
    let y_key = Shortcut::new(None, Code::KeyY);
    let n_key = Shortcut::new(None, Code::KeyN);
    let _ = gs.unregister(y_key);
    let _ = gs.unregister(n_key);
    if let Err(e) = gs.register(y_key) {
        tracing::warn!("Failed to register Y shortcut: {}", e);
    }
    if let Err(e) = gs.register(n_key) {
        tracing::warn!("Failed to register N shortcut: {}", e);
    }

    if let Some(window) = app.get_webview_window("bubble") {
        tracing::info!("Found bubble window, positioning and showing");
        position_bubble_window(&app)?;
        let _ = window.show();
        let _ = window.set_focus();
        tracing::info!("Bubble window show() called");
    } else {
        tracing::warn!("Bubble window not found!");
    }
    Ok(())
}

#[tauri::command]
pub fn hide_bubble_window(app: AppHandle) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister(Shortcut::new(None, Code::KeyY));
    let _ = gs.unregister(Shortcut::new(None, Code::KeyN));

    if let Some(window) = app.get_webview_window("bubble") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn position_bubble_above_pet(app: AppHandle) -> Result<(), String> {
    position_bubble_window(&app)
}

fn position_bubble_window(app: &AppHandle) -> Result<(), String> {
    const BUBBLE_WIDTH: i32 = 380;
    const BUBBLE_HEIGHT: i32 = 329;

    let main_window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    let bubble_window = app.get_webview_window("bubble")
        .ok_or("Bubble window not found")?;

    let main_pos = main_window.outer_position().map_err(|e| e.to_string())?;
    let main_size = main_window.outer_size().map_err(|e| e.to_string())?;

    // Find which monitor the main window is on
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let screen = monitors.iter()
        .find(|m| {
            let pos = m.position();
            let size = m.size();
            main_pos.x >= pos.x && main_pos.x < pos.x + size.width as i32
                && main_pos.y >= pos.y && main_pos.y < pos.y + size.height as i32
        })
        .cloned()
        .or_else(|| monitors.iter().next().cloned())
        .ok_or("No monitor found")?;

    let screen_pos = screen.position();
    let screen_size = screen.size();
    let screen_width = screen_size.width as i32;
    let screen_height = screen_size.height as i32;
    let screen_right = screen_pos.x + screen_width;
    let screen_bottom = screen_pos.y + screen_height;

    tracing::info!(
        "main_pos: {:?}, main_size: {:?}, screen_pos: {:?}, screen: {}x{}",
        main_pos, main_size, screen_pos, screen_width, screen_height
    );

    // Step 1 & 2: Calculate bubble position
    // bubble_x = 宠物窗口.x - 宠物窗口.width/2 + bubble.width/2 (居中对齐)
    // bubble_y = 宠物窗口.y - bubble.height (bubble在宠物正上方，底部对齐宠物顶部)
    let bubble_x = main_pos.x - main_size.width as i32 / 2 + BUBBLE_WIDTH / 2;
    let bubble_y = main_pos.y - BUBBLE_HEIGHT;

    tracing::info!("Bubble calculated position: ({}, {})", bubble_x, bubble_y);

    // Step 3: Calculate four corners of bubble window
    let bubble_left = bubble_x;
    let bubble_top = bubble_y;
    let bubble_right = bubble_x + BUBBLE_WIDTH;
    let bubble_bottom = bubble_y + BUBBLE_HEIGHT;

    tracing::info!(
        "Bubble corners before clamp: left={}, top={}, right={}, bottom={}",
        bubble_left, bubble_top, bubble_right, bubble_bottom
    );

    // Check if any corner is out of bounds and clamp
    let final_x = bubble_left.clamp(screen_pos.x, screen_right - BUBBLE_WIDTH);
    let final_y = bubble_top.clamp(screen_pos.y, screen_bottom - BUBBLE_HEIGHT);

    tracing::info!("Bubble final position: ({}, {})", final_x, final_y);

    // 右边界优化
    if final_x > screen_pos.x + screen_width/2 {
        let optimus_final_x = final_x - BUBBLE_WIDTH;
        bubble_window.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition { x: optimus_final_x, y: final_y }
        )).map_err(|e| e.to_string())?;
    }else {
        bubble_window.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition { x: final_x, y: final_y }
        )).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_claude_code_process_count() -> Result<usize, String> {
    let mut system = sysinfo::System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    use std::ffi::OsStr;
    let count = system.processes_by_name(OsStr::new("Claude Code"))
        .count() +
        system.processes_by_name(OsStr::new("claude-code"))
        .count() +
        system.processes_by_name(OsStr::new("claude"))
        .count() +
        system.processes_by_name(OsStr::new("Code.exe"))
        .filter(|p| {
            let cmd = p.cmd();
            cmd.iter().any(|arg| {
                arg.to_string_lossy().to_lowercase().contains("claude")
            })
        })
        .count();

    tracing::info!("Claude Code process count: {}", count);
    Ok(count)
}

#[tauri::command]
pub fn get_claude_config_path() -> Result<Option<String>, String> {
    if let Some(home) = dirs::home_dir() {
        let config_path = home.join(".claude").join("settings.json");
        if config_path.exists() {
            return Ok(Some(config_path.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn check_claude_config_has_hook(config_path: String) -> Result<Option<bool>, String> {
    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    Ok(Some(content.contains("http://localhost:10425/tf-")))
}

#[derive(Debug, serde::Serialize)]
pub struct PetStats {
    pub current_pet_id: String,
    pub mood: i32,
    pub fullness: i32,
    pub affection: i32,
    pub owner_title: String,
}

#[tauri::command]
pub fn get_pet_stats(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
) -> Result<PetStats, String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT current_pet_id, mood, fullness, affection, owner_title FROM pet_stats WHERE id = 1"
    ).map_err(|e| e.to_string())?;

    let stats = stmt.query_row([], |row| {
        Ok(PetStats {
            current_pet_id: row.get(0)?,
            mood: row.get(1)?,
            fullness: row.get(2)?,
            affection: row.get(3)?,
            owner_title: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
pub fn update_pet_stats(
    db: tauri::State<'_, Arc<Mutex<Option<rusqlite::Connection>>>>,
    #[allow(non_snake_case)] currentPetId: Option<String>,
    #[allow(non_snake_case)] ownerTitle: Option<String>,
    mood: Option<i32>,
    fullness: Option<i32>,
    affection: Option<i32>,
) -> Result<(), String> {
    let db_guard = db.blocking_lock();
    let conn = db_guard.as_ref().ok_or("Database not initialized")?;

    if let Some(ref pet_id) = currentPetId {
        conn.execute("UPDATE pet_stats SET current_pet_id = ?, last_updated = ? WHERE id = 1", rusqlite::params![pet_id, chrono::Utc::now().timestamp()]).map_err(|e| e.to_string())?;
    }
    if let Some(m) = mood {
        conn.execute("UPDATE pet_stats SET mood = ?, last_updated = ? WHERE id = 1", rusqlite::params![m, chrono::Utc::now().timestamp()]).map_err(|e| e.to_string())?;
    }
    if let Some(f) = fullness {
        conn.execute("UPDATE pet_stats SET fullness = ?, last_updated = ? WHERE id = 1", rusqlite::params![f, chrono::Utc::now().timestamp()]).map_err(|e| e.to_string())?;
    }
    if let Some(a) = affection {
        conn.execute("UPDATE pet_stats SET affection = ?, last_updated = ? WHERE id = 1", rusqlite::params![a, chrono::Utc::now().timestamp()]).map_err(|e| e.to_string())?;
    }
    if let Some(ref title) = ownerTitle {
        conn.execute("UPDATE pet_stats SET owner_title = ?, last_updated = ? WHERE id = 1", rusqlite::params![title, chrono::Utc::now().timestamp()]).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct MountHookResult {
    pub success: bool,
    pub backup_path: Option<String>,
    pub message: String,
}

#[tauri::command]
pub fn mount_hook() -> Result<MountHookResult, String> {
    let config_path = dirs::home_dir()
        .ok_or("无法获取用户主目录")?
        .join(".claude")
        .join("settings.json");

    if !config_path.exists() {
        return Ok(MountHookResult {
            success: false,
            backup_path: None,
            message: "配置文件不存在".to_string(),
        });
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    let now = chrono::Local::now();
    let date_str = now.format("%y%m%d").to_string();
    let config_dir = config_path.parent().ok_or("无法获取配置目录")?;

    let mut backup_path = config_dir.join(format!("settings_TF_{}_00.json", date_str));
    while backup_path.exists() {
        let current_seq: u32 = backup_path.file_name()
            .and_then(|n| n.to_str())
            .and_then(|s| s.split("_TF_").nth(1))
            .and_then(|s| s.split(".json").next())
            .and_then(|s| s.split("_").last())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        backup_path = config_dir.join(format!("settings_TF_{}_{:02}.json", date_str, current_seq + 1));
    }

    std::fs::copy(&config_path, &backup_path)
        .map_err(|e| format!("备份配置文件失败: {}", e))?;

    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("配置文件解析失败: {}", e))?;

    if !json.get("hooks").is_some() {
        json["hooks"] = serde_json::json!({});
    }

    if !json["hooks"].get("PreToolUse").is_some() {
        json["hooks"]["PreToolUse"] = serde_json::json!([]);
    }

    let pretooluse = json["hooks"]["PreToolUse"].as_array_mut().unwrap();

    // 我们的 hook 配置
    let our_hook = serde_json::json!({
        "matcher": ".*",
        "hooks": [
            {
                "type": "http",
                "url": "http://localhost:10425/tf-pretooluse"
            }
        ]
    });

    // 查找是否已存在我们的 hook（通过 url 判断）
    let hook_prefix = "http://localhost:10425/tf-";
    let existing_idx = pretooluse.iter().position(|h| {
        h.get("hooks")
            .and_then(|arr| arr.as_array())
            .map(|hooks| hooks.iter().any(|hook| {
                hook.get("url")
                    .and_then(|u| u.as_str())
                    .map(|url| url.starts_with(hook_prefix))
                    .unwrap_or(false)
            }))
            .unwrap_or(false)
    });

    if let Some(idx) = existing_idx {
        // 覆盖已存在的 hook
        pretooluse[idx] = our_hook;
    } else {
        // 新增 hook
        pretooluse.push(our_hook);
    }

    let new_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, new_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    Ok(MountHookResult {
        success: true,
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        message: "Hook 挂载成功".to_string(),
    })
}

#[derive(Debug, serde::Serialize)]
pub struct UnmountHookResult {
    pub success: bool,
    pub backup_path: Option<String>,
    pub message: String,
}

#[tauri::command]
pub fn unmount_hook() -> Result<UnmountHookResult, String> {
    let config_path = dirs::home_dir()
        .ok_or("无法获取用户主目录")?
        .join(".claude")
        .join("settings.json");

    if !config_path.exists() {
        return Ok(UnmountHookResult {
            success: false,
            backup_path: None,
            message: "配置文件不存在".to_string(),
        });
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    // 创建备份
    let now = chrono::Local::now();
    let date_str = now.format("%y%m%d").to_string();
    let config_dir = config_path.parent().ok_or("无法获取配置目录")?;

    let mut backup_path = config_dir.join(format!("settings_TF_{}_00.json", date_str));
    while backup_path.exists() {
        let current_seq: u32 = backup_path.file_name()
            .and_then(|n| n.to_str())
            .and_then(|s| s.split("_TF_").nth(1))
            .and_then(|s| s.split(".json").next())
            .and_then(|s| s.split("_").last())
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        backup_path = config_dir.join(format!("settings_TF_{}_{:02}.json", date_str, current_seq + 1));
    }

    std::fs::copy(&config_path, &backup_path)
        .map_err(|e| format!("备份配置文件失败: {}", e))?;

    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("配置文件解析失败: {}", e))?;

    if let Some(pretooluse) = json.get_mut("hooks")
        .and_then(|h| h.get_mut("PreToolUse"))
        .and_then(|pt| pt.as_array_mut())
    {
        pretooluse.retain(|h| {
            !h.get("hooks")
                .and_then(|hooks| hooks.as_array())
                .map(|arr| arr.iter().any(|hook| {
                    hook.get("url")
                        .and_then(|u| u.as_str())
                        .map(|u| u.contains("localhost:10425/tf-"))
                        .unwrap_or(false)
                }))
                .unwrap_or(false)
        });
    }

    let new_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&config_path, new_content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;

    Ok(UnmountHookResult {
        success: true,
        backup_path: Some(backup_path.to_string_lossy().to_string()),
        message: "Hook 已解除".to_string(),
    })
}
