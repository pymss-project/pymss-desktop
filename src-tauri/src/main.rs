#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod error;
mod python;
mod state;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::app_cmd::cancel_task,
            commands::app_cmd::delete_model,
            commands::app_cmd::download_model,
            commands::app_cmd::get_env_info,
            commands::app_cmd::get_model_info,
            commands::app_cmd::list_models,
            commands::app_cmd::pick_audio_files,
            commands::app_cmd::pick_input_folder,
            commands::app_cmd::pick_output_folder,
            commands::app_cmd::reveal_path,
            commands::app_cmd::start_env_check,
            commands::app_cmd::start_model_download,
            commands::app_cmd::start_separation,
            commands::app_cmd::worker_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pymss Studio");
}
