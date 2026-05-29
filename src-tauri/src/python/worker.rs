use crate::error::{AppError, AppResult};
use crate::python::protocol::WorkerEnvelope;
use crate::state::AppState;
use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

fn worker_path(app: &AppHandle) -> AppResult<PathBuf> {
    if cfg!(debug_assertions) {
        // CARGO_MANIFEST_DIR is set at compile time to src-tauri/
        let src_tauri = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // src-tauri/../python/worker.py
        let path = src_tauri.parent().unwrap().join("python").join("worker.py");
        if path.exists() {
            return Ok(path);
        }
        // Fallback: try cwd (for backward compatibility)
        let cwd = std::env::current_dir()?;
        Ok(cwd.join("python").join("worker.py"))
    } else {
        let resource = app
            .path()
            .resource_dir()
            .map_err(|e| AppError::Worker(e.to_string()))?;
        Ok(resource.join("python").join("worker.py"))
    }
}

fn make_payload_file(command: &str, task_id: Option<&str>, payload: Value) -> AppResult<PathBuf> {
    let mut path = std::env::temp_dir();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    path.push(format!(
        "pymss-studio-payload-{}-{}-{}-{}.json",
        command,
        task_id.unwrap_or("once"),
        std::process::id(),
        stamp
    ));
    let mut file = std::fs::File::create(&path)?;
    file.write_all(serde_json::to_string(&payload)?.as_bytes())?;
    Ok(path)
}

fn build_worker_command(app: &AppHandle, command: &str, payload_file: Option<&PathBuf>) -> AppResult<Command> {
    let worker = worker_path(app)?;
    let python = std::env::var("PYMSS_STUDIO_PYTHON").unwrap_or_else(|_| "python".to_string());
    let pymss_source = std::env::var("PYMSS_STUDIO_PYMSS_PATH").unwrap_or_else(|_| "E:\\123\\pymss".to_string());
    let mut cmd = Command::new(python);
    cmd.arg(worker)
        .arg(command)
        .env("PYTHONPATH", pymss_source)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");
    if let Some(path) = payload_file {
        cmd.arg("--payload").arg(path);
    }
    Ok(cmd)
}

fn emit_worker_stderr(app: &AppHandle, line: String) {
    let _ = app.emit("pymss://worker-event", serde_json::json!({
        "type": "worker_stderr",
        "payload": { "message": line }
    }));
}

fn emit_task_log(app: &AppHandle, task_id: &str, level: &str, message: String) {
    let _ = app.emit("pymss://worker-event", serde_json::json!({
        "type": "task_log",
        "taskId": task_id,
        "payload": { "level": level, "message": message }
    }));
}

fn read_lossy_lines<R: Read>(reader: R, mut on_line: impl FnMut(String)) {
    let mut reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf) {
            Ok(0) => break,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n' | b'\r')) {
                    buf.pop();
                }
                on_line(String::from_utf8_lossy(&buf).into_owned());
            }
            Err(_) => break,
        }
    }
}

pub fn run_worker_once(app: &AppHandle, command: &str) -> AppResult<Value> {
    run_worker_with_payload(app, command, None)
}

pub fn run_worker_with_payload(app: &AppHandle, command: &str, payload: Option<Value>) -> AppResult<Value> {
    let payload_file = match payload {
        Some(value) => Some(make_payload_file(command, None, value)?),
        None => None,
    };
    let mut cmd = build_worker_command(app, command, payload_file.as_ref())?;
    let mut child = cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;

    let stdout = child.stdout.take().ok_or_else(|| AppError::Worker("missing worker stdout".into()))?;
    let stderr = child.stderr.take();
    let stderr_app = app.clone();
    let stderr_handle = stderr.map(|stderr| {
        std::thread::spawn(move || {
            read_lossy_lines(stderr, |line| emit_worker_stderr(&stderr_app, line));
        })
    });
    let mut last_payload = Value::Null;
    let mut worker_error: Option<AppError> = None;
    read_lossy_lines(stdout, |line| {
        if line.trim().is_empty() || worker_error.is_some() {
            return;
        }
        match serde_json::from_str::<WorkerEnvelope>(&line) {
            Ok(envelope) => {
                last_payload = envelope.payload.clone();
                let _ = app.emit("pymss://worker-event", &envelope);
                if envelope.event_type == "error" {
                    worker_error = Some(AppError::Worker(envelope.payload.get("message").and_then(Value::as_str).unwrap_or("worker error").to_string()));
                }
            }
            Err(err) => {
                worker_error = Some(AppError::Worker(format!("Invalid worker event: {err}; raw={line}")));
            }
        }
    });
    if let Some(err) = worker_error {
        if let Some(path) = payload_file.as_ref() {
            let _ = std::fs::remove_file(path);
        }
        return Err(err);
    }

    let status = child.wait()?;
    if let Some(handle) = stderr_handle {
        let _ = handle.join();
    }
    if let Some(path) = payload_file.as_ref() {
        let _ = std::fs::remove_file(path);
    }
    if !status.success() {
        return Err(AppError::Worker(format!("worker exited with {status}")));
    }
    Ok(last_payload)
}

pub fn spawn_worker_background(
    app: AppHandle,
    state: State<'_, AppState>,
    command: &str,
    task_id: String,
    payload: Value,
) -> AppResult<()> {
    let payload_file = make_payload_file(command, Some(&task_id), payload)?;
    let mut cmd = build_worker_command(&app, command, Some(&payload_file))?;
    let mut child: Child = cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::Worker("missing worker stdout".into()))?;
    let stderr = child.stderr.take();
    let stderr_app = app.clone();
    let stderr_task_id = task_id.clone();
    let stderr_handle = stderr.map(|stderr| {
        std::thread::spawn(move || {
            read_lossy_lines(stderr, |line| emit_task_log(&stderr_app, &stderr_task_id, "warning", line));
        })
    });
    let shared_child = Arc::new(Mutex::new(child));
    {
        let mut tasks = state
            .tasks
            .lock()
            .map_err(|_| AppError::Worker("task registry lock poisoned".into()))?;
        tasks.insert(task_id.clone(), shared_child.clone());
    }
    std::thread::spawn(move || {
        read_lossy_lines(stdout, |line| {
            if line.trim().is_empty() {
                return;
            }
            match serde_json::from_str::<WorkerEnvelope>(&line) {
                Ok(envelope) => {
                    let _ = app.emit("pymss://worker-event", &envelope);
                }
                Err(err) => {
                    let _ = app.emit("pymss://worker-event", serde_json::json!({
                        "type": "error",
                        "taskId": &task_id,
                        "payload": { "message": format!("Invalid worker event: {err}") }
                    }));
                }
            }
        });
        if let Ok(mut child) = shared_child.lock() {
            let _ = child.wait();
        }
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }
        let _ = std::fs::remove_file(payload_file);
        let cleanup_state = app.state::<AppState>();
        if let Ok(mut tasks) = cleanup_state.tasks.lock() {
            tasks.remove(&task_id);
        };
    });

    Ok(())
}
