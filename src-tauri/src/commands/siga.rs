/// Opens the trusted school portal in its own restricted native window.
#[tauri::command]
#[specta::specta]
pub async fn open_siga_portal(app: tauri::AppHandle) -> Result<(), String> {
    crate::school::open_school_portal(app).await
}

/// Open the bundled read-only local school preview in a minimally privileged window.
#[tauri::command]
#[specta::specta]
pub async fn open_offline_shell(app: tauri::AppHandle) -> Result<(), String> {
    crate::school::open_offline_shell(app).await
}

/// Reports update configuration without invoking an unconfigured updater plugin.
#[tauri::command]
#[specta::specta]
pub async fn desktop_update_status(
    app: tauri::AppHandle,
) -> Result<crate::school::AppUpdate, String> {
    crate::school::check_app_update(app).await
}

/// Relatório nativo para a shell local. NÃO concede acesso a dados de escolas:
/// as capacidades apenas reportam funcionalidades efectivamente activadas.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DesktopOfflineReadiness {
    pub app_version: String,
    pub bundled_ui_ready: bool,
    pub schema_version: u32,
    pub sqlcipher_ready: bool,
    pub authorized_bootstrap_ready: bool,
    pub bidirectional_sync_ready: bool,
    pub private_data_offline_ready: bool,
    pub signed_updater_configured: bool,
}

impl DesktopOfflineReadiness {
    fn new(version: String, updater_configured: bool) -> Self {
        // O esquema existe no código, mas não foi aberto em disco.
        const SCHEMA: &str = include_str!("../../../desktop/local-db/0001_offline_metadata.sql");
        let schema_version = if SCHEMA.contains("PRAGMA user_version = 1;") {
            1
        } else {
            0
        };
        Self {
            app_version: version,
            bundled_ui_ready: true,
            schema_version,
            sqlcipher_ready: false,
            authorized_bootstrap_ready: false,
            bidirectional_sync_ready: false,
            private_data_offline_ready: false,
            signed_updater_configured: updater_configured,
        }
    }
}

/// Disponível apenas para a janela "offline-shell", sem abrir ficheiros,
/// revelar nomes de escolas nem transmitir credenciais ao JavaScript.
#[tauri::command]
#[specta::specta]
pub fn desktop_offline_readiness(app: tauri::AppHandle) -> DesktopOfflineReadiness {
    DesktopOfflineReadiness::new(
        app.package_info().version.to_string(),
        crate::school::updater_configured(&app.config().plugins),
    )
}

#[cfg(test)]
mod offline_readiness_tests {
    use super::*;

    #[test]
    fn native_status_never_claims_private_data_before_encryption_and_auth() {
        for configured in [false, true] {
            let status = DesktopOfflineReadiness::new("1.2.2".to_string(), configured);
            assert!(status.bundled_ui_ready);
            assert_eq!(status.schema_version, 1);
            assert!(!status.sqlcipher_ready);
            assert!(!status.authorized_bootstrap_ready);
            assert!(!status.bidirectional_sync_ready);
            assert!(!status.private_data_offline_ready);
            assert_eq!(status.signed_updater_configured, configured);
        }
    }

    #[test]
    fn status_is_non_sensitive_and_serializes_using_frontend_names() {
        let value =
            serde_json::to_value(DesktopOfflineReadiness::new("1.2.2".into(), false)).unwrap();
        assert_eq!(value["appVersion"], "1.2.2");
        assert_eq!(value["sqlcipherReady"], false);
        assert!(value.get("schoolId").is_none());
        assert!(value.get("dataPath").is_none());
    }
}
