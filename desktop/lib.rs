use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

// Checks the update endpoint on launch. If a newer signed build is published,
// asks the user; on "Install", downloads it and relaunches into the new version.
async fn check_for_update(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(_) => return,
    };
    let update = match updater.check().await {
        Ok(Some(u)) => u,
        _ => return, // up to date, offline, or endpoint unreachable — stay quiet
    };

    let install = app
        .dialog()
        .message(format!(
            "TripMate {} is available (you have {}).\n\nInstall now and restart?",
            update.version, update.current_version
        ))
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install & restart".into(),
            "Later".into(),
        ))
        .blocking_show();

    if !install {
        return;
    }

    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(_) => {
            app.restart();
        }
        Err(e) => {
            app.dialog()
                .message(format!("Update failed: {e}\n\nTry again from the website."))
                .title("Update failed")
                .kind(MessageDialogKind::Error)
                .blocking_show();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Without this, WebView2's Notification.requestPermission() has no
        // OS-level app registration to grant against -- it resolves to
        // "denied" regardless of the OS/browser's own notification settings,
        // since those are scoped to Chrome, not this app. Live-reported:
        // "Couldn't enable push" toast in the desktop app despite the
        // user's Chrome site settings showing Notifications: Allow.
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(check_for_update(handle));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
