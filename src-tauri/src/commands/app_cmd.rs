use crate::error::{AppError, AppResult};
use crate::python::worker::{run_worker_once, run_worker_with_payload, spawn_worker_background};
use crate::state::AppState;
use serde_json::Value;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn worker_health(app: AppHandle) -> AppResult<Value> {
    run_worker_once(&app, "health")
}

#[tauri::command]
pub async fn get_env_info(app: AppHandle) -> AppResult<Value> {
    run_worker_once(&app, "env_info")
}

#[tauri::command]
pub async fn list_models(app: AppHandle, payload: Option<Value>) -> AppResult<Value> {
    run_worker_with_payload(&app, "list_models", payload)
}

#[tauri::command]
pub async fn get_model_info(app: AppHandle, payload: Value) -> AppResult<Value> {
    run_worker_with_payload(&app, "model_info", Some(payload))
}

#[tauri::command]
pub async fn delete_model(app: AppHandle, payload: Value) -> AppResult<Value> {
    run_worker_with_payload(&app, "delete_model", Some(payload))
}

#[tauri::command]
pub async fn download_model(app: AppHandle, payload: Value) -> AppResult<Value> {
    run_worker_with_payload(&app, "download_model", Some(payload))
}

#[tauri::command]
pub async fn start_model_download(app: AppHandle, state: State<'_, AppState>, payload: Value) -> AppResult<Value> {
    let model = payload
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Worker("missing model".into()))?;
    let task_id = payload
        .get("taskId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("download_{}_{}", model.replace(|c: char| !c.is_ascii_alphanumeric(), "_"), chrono_like_timestamp()));
    let mut payload = payload;
    if let Some(object) = payload.as_object_mut() {
        object.insert("taskId".to_string(), Value::String(task_id.clone()));
    }
    spawn_worker_background(app, state, "download_model", task_id.clone(), payload)?;
    Ok(serde_json::json!({ "taskId": task_id, "started": true }))
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn start_separation(app: AppHandle, state: State<'_, AppState>, payload: Value) -> AppResult<Value> {
    let task_id = payload
        .get("taskId")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Worker("missing taskId".into()))?
        .to_string();
    spawn_worker_background(app, state, "infer", task_id.clone(), payload)?;
    Ok(serde_json::json!({ "taskId": task_id, "started": true }))
}

#[tauri::command]
pub async fn cancel_task(app: AppHandle, state: State<'_, AppState>, task_id: String) -> AppResult<bool> {
    let child = state.tasks.lock().ok().and_then(|mut tasks| tasks.remove(&task_id));
    if let Some(child) = child {
        if let Ok(mut child) = child.lock() {
            let _ = child.kill();
        }
        let _ = app.emit("pymss://worker-event", serde_json::json!({
            "type": "task_cancelled",
            "taskId": task_id,
            "payload": { "message": "Cancelled" }
        }));
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn pick_audio_files(app: AppHandle) -> AppResult<Vec<String>> {
    let files = app
        .dialog()
        .file()
        .add_filter("Audio", &["wav", "mp3", "flac", "m4a", "aac", "ogg", "opus"])
        .blocking_pick_files()
        .unwrap_or_default();
    Ok(files.into_iter().map(|p| p.to_string()).collect())
}

#[tauri::command]
pub async fn pick_input_folder(app: AppHandle) -> AppResult<Option<String>> {
    Ok(app.dialog().file().blocking_pick_folder().map(|p| p.to_string()))
}

#[tauri::command]
pub async fn pick_output_folder(app: AppHandle) -> AppResult<Option<String>> {
    Ok(app.dialog().file().blocking_pick_folder().map(|p| p.to_string()))
}

#[tauri::command]
pub async fn reveal_path(path: String) -> AppResult<()> {
    let target = Path::new(&path);
    let reveal_target = if target.is_file() {
        target.parent().unwrap_or(target)
    } else {
        target
    };
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(reveal_target).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(reveal_target).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(reveal_target).spawn()?;
    }
    Ok(())
}
