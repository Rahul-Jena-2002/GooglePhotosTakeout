use filetime::{set_file_times, FileTime};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::time::Duration;
use tauri::Manager;

fn open_system_browser(_url: &str) {
    #[cfg(target_os = "windows")]
    {
        // Standard Windows command used by VS Code / JetBrains IDEs to open default browser
        if std::process::Command::new("cmd")
            .args(["/c", "start", "", _url])
            .spawn()
            .is_err()
        {
            let _ = std::process::Command::new("rundll32")
                .args(["url.dll,FileProtocolHandler", _url])
                .spawn();
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(_url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(_url).spawn();
    }
}

fn urlencoding_decode(val: &str) -> String {
    let mut out = String::new();
    let mut chars = val.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next().unwrap_or('0');
            let h2 = chars.next().unwrap_or('0');
            if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h1, h2), 16) {
                out.push(byte as char);
            }
        } else if c == '+' {
            out.push(' ');
        } else {
            out.push(c);
        }
    }
    out
}

#[tauri::command]
async fn start_browser_login(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind loopback listener: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local port: {}", e))?
        .port();

    let auth_url = format!(
        "https://takeoutfix.pages.dev/auth/desktop?port={}&desktop=true&source=tauri",
        port
    );
    open_system_browser(&auth_url);

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(120);

        while std::time::Instant::now() < deadline {
            let _ = listener.set_nonblocking(true);
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

                    let mut buffer = [0u8; 8192];
                    let bytes_read = stream.read(&mut buffer).unwrap_or(0);
                    let req_str = String::from_utf8_lossy(&buffer[..bytes_read]);

                    if req_str.starts_with("OPTIONS") {
                        let response = "HTTP/1.1 204 No Content\r\n\
                                        Access-Control-Allow-Origin: *\r\n\
                                        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                                        Access-Control-Allow-Headers: Content-Type\r\n\
                                        Connection: close\r\n\r\n";
                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    if req_str.contains("/callback") {
                        let mut user_json = serde_json::Map::new();

                        if let Some(path_start) = req_str.find("GET /callback?") {
                            if let Some(path_end) = req_str[path_start..].find(" HTTP") {
                                let query = &req_str[path_start + 14..path_start + path_end];
                                for pair in query.split('&') {
                                    if let Some((k, v)) = pair.split_once('=') {
                                        let decoded = urlencoding_decode(v);
                                        user_json.insert(k.to_string(), serde_json::Value::String(decoded));
                                    }
                                }
                            }
                        }

                        if let Some(body_start) = req_str.find("\r\n\r\n") {
                            let body = &req_str[body_start + 4..];
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body.trim()) {
                                if let Some(obj) = parsed.as_object() {
                                    for (k, v) in obj {
                                        user_json.insert(k.clone(), v.clone());
                                    }
                                }
                            }
                        }

                        let html_body = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>TakeoutFix - Signed In</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{background:#09090b;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{text-align:center;padding:36px 32px;border:1px solid rgba(255,255,255,0.12);border-radius:20px;background:rgba(255,255,255,0.03);max-width:380px;box-shadow:0 20px 40px rgba(0,0,0,0.6);}.icon{width:52px;height:52px;border-radius:50%;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 16px auto;}h2{margin:0 0 8px 0;font-size:22px;font-weight:800;letter-spacing:-0.02em;}p{margin:0;color:#a1a1aa;font-size:14px;line-height:1.5;}</style></head><body><div class=\"card\"><div class=\"icon\">✓</div><h2>Signed in successfully!</h2><p>Your session has been transferred to TakeoutFix.<br>You can safely close this tab and return to the app.</p></div></body></html>";

                        let response = format!(
                            "HTTP/1.1 200 OK\r\n\
                             Content-Type: text/html; charset=utf-8\r\n\
                             Access-Control-Allow-Origin: *\r\n\
                             Content-Length: {}\r\n\
                             Connection: close\r\n\r\n{}",
                            html_body.len(),
                            html_body
                        );
                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.flush();

                        return Ok(serde_json::Value::Object(user_json));
                    } else {
                        let response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.flush();
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    return Err(format!("Loopback accept error: {}", e));
                }
            }
        }

        Err("Authentication timed out after 2 minutes. Please try again.".to_string())
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))??;

    #[cfg(desktop)]
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.unminimize();
    }

    Ok(result)
}

#[tauri::command]
fn sync_file_timestamps(path: String, epoch_sec: i64) -> Result<bool, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }
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
    .invoke_handler(tauri::generate_handler![
      sync_file_timestamps, 
      sync_catalog_timestamps,
      start_browser_login
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
