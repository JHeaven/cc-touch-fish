use tauri::{AppHandle, Manager};
use std::sync::Arc;
use tokio::sync::Mutex;

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
