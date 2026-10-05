/// Opens the trusted school portal in its own restricted native window.
#[tauri::command]
#[specta::specta]
pub async fn open_siga_portal(app: tauri::AppHandle) -> Result<(), String> {
    crate::school::open_school_portal(app).await
}

/// Reports update configuration without invoking an unconfigured updater plugin.
#[tauri::command]
#[specta::specta]
pub async fn desktop_update_status(
    app: tauri::AppHandle,
) -> Result<crate::school::AppUpdate, String> {
    crate::school::check_app_update(app).await
}
