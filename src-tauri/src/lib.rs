mod models;
mod storage;

#[cfg(test)]
mod storage_tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            storage::load_config,
            storage::save_config,
            storage::load_history,
            storage::delete_history_records,
            storage::test_output_directory,
            storage::get_output_directory_state,
            storage::save_generated_image,
            storage::save_batch_image,
            storage::save_batch_manifest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
