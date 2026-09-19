use filetime::{set_file_times, FileTime};
use std::path::Path;

#[tauri::command]
fn sync_file_timestamps(path: String, epoch_sec: i64) -> Result<bool, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    // Clamp to 1980-01-01 (315532800) for exFAT drive boundary safety
    let clamped_sec = if epoch_sec < 315532800 { 315532800 } else { epoch_sec };
    let ft = FileTime::from_unix_time(clamped_sec, 0);
    set_file_times(file_path, ft, ft).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn sync_catalog_timestamps(items: Vec<(String, i64)>) -> Result<usize, String> {
    let mut synced = 0;
    for (path, epoch_sec) in items {
        let file_path = Path::new(&path);
        if file_path.exists() {
            let clamped_sec = if epoch_sec < 315532800 { 315532800 } else { epoch_sec };
            let ft = FileTime::from_unix_time(clamped_sec, 0);
            if set_file_times(file_path, ft, ft).is_ok() {
                synced += 1;
            }
        }
    }
    Ok(synced)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![sync_file_timestamps, sync_catalog_timestamps])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
