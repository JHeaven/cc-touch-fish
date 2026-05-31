use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tauri::{AppHandle, Emitter};

use crate::{PreToolUseState, ToolApprovalRequest};

const HTTP_PORT: u16 = 10425;

pub async fn run(state: Arc<Mutex<PreToolUseState>>, app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/tf-pretooluse", post(prettooluse_handler))
        .route("/tf-pending", get(pending_handler))
        .route("/health", post(health_handler))
        .layer(cors)
        .with_state((state, app_handle));

    let addr = format!("127.0.0.1:{}", HTTP_PORT);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("HTTP server listening on http://{}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PreToolUseInput {
    pub session_id: String,
    pub cwd: String,
    pub hook_event_name: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct HookOutput {
    #[serde(rename = "hookSpecificOutput")]
    pub hook_specific_output: HookSpecificOutput,
}

#[derive(Debug, Serialize)]
pub struct HookSpecificOutput {
    #[serde(rename = "hookEventName")]
    pub hook_event_name: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "permissionDecision")]
    pub permission_decision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "permissionDecisionReason")]
    pub permission_decision_reason: Option<String>,
}

async fn prettooluse_handler(
    State((state, app_handle)): State<(Arc<Mutex<PreToolUseState>>, AppHandle)>,
    Json(payload): Json<PreToolUseInput>,
) -> Json<HookOutput> {
    tracing::info!("[PreToolUse] {} with {:?}", payload.tool_name, payload.tool_input);

    let (tx, rx) = tokio::sync::oneshot::channel();

    {
        let mut state = state.lock().await;
        state.pending_request = Some(ToolApprovalRequest {
            tool_name: payload.tool_name.clone(),
            command: payload
                .tool_input
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            cwd: payload.cwd.clone(),
            session_id: payload.session_id.clone(),
            timestamp: chrono::Utc::now().timestamp_millis(),
        });
        state.response_tx = Some(tx);
    }

    // Emit the approval-request event with the payload data
    if let Err(e) = app_handle.emit("approval-request", &payload) {
        tracing::error!("Failed to emit approval-request event: {}", e);
    } else {
        tracing::info!("Emitted approval-request event to frontend");
    }

    // Also emit a show-bubble event to trigger the bubble window
    // Extract command from tool_input for the frontend
    let command = payload.tool_input.get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    #[derive(serde::Serialize)]
    struct BubbleEventPayload {
        tool_name: String,
        command: String,
        cwd: String,
        session_id: String,
    }

    let bubble_payload = BubbleEventPayload {
        tool_name: payload.tool_name.clone(),
        command,
        cwd: payload.cwd.clone(),
        session_id: payload.session_id.clone(),
    };

    if let Err(e) = app_handle.emit("show-bubble", &bubble_payload) {
        tracing::error!("Failed to emit show-bubble event: {}", e);
    } else {
        tracing::info!("Emitted show-bubble event");
    }

    let approved = match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
        Ok(Ok(result)) => result,
        _ => false,
    };

    {
        let mut state = state.lock().await;
        state.pending_request = None;
        state.response_tx = None;
    }

    Json(HookOutput {
        hook_specific_output: HookSpecificOutput {
            hook_event_name: "PreToolUse".to_string(),
            permission_decision: Some(if approved {
                "allow".to_string()
            } else {
                "deny".to_string()
            }),
            permission_decision_reason: if approved {
                Some("Approved by cc-touch-fish".to_string())
            } else {
                Some("Denied by cc-touch-fish".to_string())
            },
        },
    })
}

async fn health_handler() -> &'static str {
    "OK"
}

#[derive(Debug, Serialize)]
pub struct PendingResponse {
    pub pending: bool,
    pub tool_name: Option<String>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub session_id: Option<String>,
    pub timestamp: Option<i64>,
}

async fn pending_handler(
    State((state, _app_handle)): State<(Arc<Mutex<PreToolUseState>>, AppHandle)>,
) -> Json<PendingResponse> {
    let state = state.lock().await;
    if let Some(req) = &state.pending_request {
        Json(PendingResponse {
            pending: true,
            tool_name: Some(req.tool_name.clone()),
            command: Some(req.command.clone()),
            cwd: Some(req.cwd.clone()),
            session_id: Some(req.session_id.clone()),
            timestamp: Some(req.timestamp),
        })
    } else {
        Json(PendingResponse {
            pending: false,
            tool_name: None,
            command: None,
            cwd: None,
            session_id: None,
            timestamp: None,
        })
    }
}
