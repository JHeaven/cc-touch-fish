mod commands;
mod http_server;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tauri_plugin_single_instance::init as init_single_instance;
use rfd::MessageDialog;

#[derive(Default)]
pub struct PreToolUseState {
    pub pending_request: Option<ToolApprovalRequest>,
    pub response_tx: Option<tokio::sync::oneshot::Sender<bool>>,
}

pub struct AppState {
    pub prettooluse: Arc<Mutex<PreToolUseState>>,
    pub db: Arc<Mutex<Option<rusqlite::Connection>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            prettooluse: Arc::new(Mutex::new(PreToolUseState::default())),
            db: Arc::new(Mutex::new(None)),
        }
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            prettooluse: self.prettooluse.clone(),
            db: self.db.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ToolApprovalRequest {
    pub tool_name: String,
    pub command: String,
    pub cwd: String,
    pub session_id: String,
    pub timestamp: i64,
}

fn create_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<(
    Menu<R>,
    tauri::menu::CheckMenuItem<R>
)> {
    let always_on_top = tauri::menu::CheckMenuItem::with_id(app, "always_on_top", "宠物置顶", true, false, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "打开设置", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let about = MenuItem::with_id(app, "关于", "关于", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&always_on_top, &settings, &separator, &about, &quit])?;
    Ok((menu, always_on_top))
}

fn get_data_dir() -> PathBuf {
    let dir = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| {
            tracing::warn!("LOCALAPPDATA env var not found, trying dirs::data_local_dir()");
            dirs::data_local_dir()
        })
        .unwrap_or_else(|| {
            tracing::warn!("Cannot determine local app data dir, using exe directory");
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from("."))
        });
    let path = dir.join("cc-touch-fish");
    tracing::info!("Data directory: {:?}", path);
    path
}

fn init_database() -> Result<rusqlite::Connection, String> {
    let data_dir = get_data_dir();
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let db_path = data_dir.join("pet_data.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS pet_stats (
            id INTEGER PRIMARY KEY,
            current_pet_id TEXT DEFAULT 'alice',
            mood INTEGER DEFAULT 100,
            fullness INTEGER DEFAULT 100,
            affection INTEGER DEFAULT 100,
            owner_title TEXT DEFAULT '主人',
            last_updated INTEGER
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Migration: add current_pet_id column if missing (for existing tables)
    let has_current_pet_id: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('pet_stats') WHERE name = 'current_pet_id'",
        [],
        |row| row.get::<_, i32>(0),
    ).map(|count| count > 0).unwrap_or(false);
    if !has_current_pet_id {
        conn.execute("ALTER TABLE pet_stats ADD COLUMN current_pet_id TEXT DEFAULT 'alice'", [])
            .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT OR IGNORE INTO pet_stats (id, current_pet_id, mood, fullness, affection, owner_title, last_updated)
         VALUES (1, 'alice', 100, 100, 100, '主人', ?)",
        [chrono::Utc::now().timestamp()],
    ).map_err(|e| e.to_string())?;

    // Hook settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS hook_settings (
            id INTEGER PRIMARY KEY,
            auto_approve_countdown INTEGER DEFAULT 10,
            deny_countdown INTEGER DEFAULT 60
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO hook_settings (id, auto_approve_countdown, deny_countdown)
         VALUES (1, 10, 60)",
        [],
    ).map_err(|e| e.to_string())?;

    // Hook tools table (一级：工具名)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS hook_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool_name TEXT NOT NULL UNIQUE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Hook commands table (二级：命令前缀 + 自动审批状态)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS hook_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool_id INTEGER NOT NULL,
            command_pattern TEXT NOT NULL,
            auto_approve INTEGER DEFAULT 0,
            FOREIGN KEY (tool_id) REFERENCES hook_tools(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Insert sample data if no tools exist
    let tool_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM hook_tools",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    if tool_count == 0 {
        // Sample tools and commands
        let sample_data: Vec<(&str, &[(&str, bool)])> = vec![
            ("Bash", &[
                ("ls", true),
                ("cat", true),
                ("echo", true),
                ("pwd", true),
                ("cd ", true),
                ("git status", true),
                ("git diff", true),
                ("git log", true),
                ("git branch", true),
                ("npm install", true),
                ("pnpm install", true),
                ("cargo build", true),
                ("cargo check", true),
                ("cargo run", true),
                ("rm -rf", false),
                ("git push --force", false),
                ("git push -f", false),
                ("sudo rm", false),
                ("dd if=", false),
                ("mkfs", false),
            ]),
            ("WebSearch", &[
                ("WebSearch", true),
            ]),
            ("WebFetch", &[
                ("WebFetch", true),
            ]),
            ("Read", &[
                ("Read", true),
            ]),
            ("Glob", &[
                ("Glob", true),
            ]),
            ("Grep", &[
                ("Grep", true),
            ]),
            ("Write", &[
                ("Write", false),
            ]),
            ("Edit", &[
                ("Edit", false),
            ]),
            ("NotebookEdit", &[
                ("NotebookEdit", false),
            ]),
            ("LSP", &[
                ("LSP", true),
            ]),
            ("TodoWrite", &[
                ("TodoWrite", true),
            ]),
        ];

        for (tool_name, commands) in sample_data {
            conn.execute(
                "INSERT OR IGNORE INTO hook_tools (tool_name) VALUES (?)",
                [tool_name],
            ).map_err(|e| e.to_string())?;

            let tool_id: i64 = conn.query_row(
                "SELECT id FROM hook_tools WHERE tool_name = ?",
                [tool_name],
                |row| row.get(0),
            ).unwrap_or(0);

            for (cmd_pattern, auto_approve) in commands {
                conn.execute(
                    "INSERT OR IGNORE INTO hook_commands (tool_id, command_pattern, auto_approve) VALUES (?, ?, ?)",
                    rusqlite::params![tool_id, cmd_pattern, if *auto_approve { 1 } else { 0 }],
                ).map_err(|e| e.to_string())?;
            }
        }

        tracing::info!("Sample hook data inserted");
    }

    tracing::info!("Database initialized at {:?}", db_path);
    Ok(conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    let prettooluse_state: Arc<Mutex<PreToolUseState>> = Arc::new(Mutex::new(PreToolUseState::default()));

    let db_conn = match init_database() {
        Ok(conn) => Some(conn),
        Err(e) => {
            tracing::error!("Failed to initialize database: {}", e);
            None
        }
    };
    let db_state = Arc::new(Mutex::new(db_conn));

    tauri::Builder::default()
        .plugin(init_single_instance(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            MessageDialog::new()
                .set_title("CC Touch Fish")
                .set_description("程序已经打开过了，不要再打开一遍。")
                .show();
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, ShortcutState};
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.key == Code::KeyY {
                        let _ = app.emit_to("bubble", "bubble-shortcut-y", ());
                    } else if shortcut.key == Code::KeyN {
                        let _ = app.emit_to("bubble", "bubble-shortcut-n", ());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .manage(prettooluse_state.clone())
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![
            commands::set_click_through,
            commands::submit_approval,
            commands::show_bubble_window,
            commands::hide_bubble_window,
            commands::position_bubble_above_pet,
            commands::get_claude_code_process_count,
            commands::get_claude_config_path,
            commands::check_claude_config_has_hook,
            commands::get_pet_stats,
            commands::update_pet_stats,
            commands::mount_hook,
            commands::unmount_hook,
            commands::quit_app,
            commands::get_hook_settings,
            commands::update_hook_settings,
            commands::get_hook_rules,
            commands::add_hook_tool,
            commands::remove_hook_tool,
            commands::add_hook_command,
            commands::remove_hook_command,
            commands::update_tool_auto_approve,
            commands::update_command_auto_approve,
            commands::check_auto_approve,
            commands::update_hook_tool_name,
            commands::update_hook_command_pattern,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Position main window at bottom-right
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(monitors) = app.available_monitors() {
                    if let Some(monitor) = monitors.iter().next() {
                        let screen_size = monitor.size();
                        let screen_width = screen_size.width as i32;
                        let screen_height = screen_size.height as i32;
                        let window_width = 135;
                        let window_height = 175;
                        let x = screen_width - window_width*2 -20;
                        let y = screen_height - window_height*2 -60;
                        let _ = window.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition { x, y }
                        ));
                    }
                }
            }

            // Create tray menu
            let (menu, always_on_top_item) = create_tray_menu(&app_handle)?;
            let always_on_top_item_for_tray = always_on_top_item.clone();

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "always_on_top" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let is_on_top = window.is_always_on_top().unwrap_or(false);
                                let new_state = !is_on_top;
                                let _ = window.set_always_on_top(new_state);
                                let _ = always_on_top_item.set_checked(new_state);
                                let _ = app.emit("always-on-top-changed", new_state);
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("settings") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                // Create settings window if it doesn't exist
                                if let Ok(window) = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "settings",
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("CC Touch Fish")
                                .inner_size(800.0, 500.0)
                                .resizable(false)
                                .center()
                                .build()
                                {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "about" => {
                            if let Some(window) = app.get_webview_window("settings") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("switch-tab", "about");
                            } else {
                                // Create settings window if it doesn't exist
                                if let Ok(window) = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "settings",
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("CC Touch Fish")
                                .inner_size(800.0, 500.0)
                                .resizable(false)
                                .center()
                                .build()
                                {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = window.emit("switch-tab", "about");
                                }
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_always_on_top(true);
                            let _ = always_on_top_item_for_tray.set_checked(true);
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Auto-open settings window on startup (delayed to let main window load first)
            let app_handle_delay = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if let Some(window) = app_handle_delay.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

            // Spawn HTTP server in background
            let http_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = http_server::run(prettooluse_state.clone(), http_handle).await {
                    tracing::error!("HTTP server error: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
