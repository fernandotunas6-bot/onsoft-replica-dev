fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "greet",
            "load_preferences",
            "save_preferences",
            "send_native_notification",
            "save_emergency_data",
            "load_emergency_data",
            "cleanup_old_recovery_files",
            "show_quick_pane",
            "dismiss_quick_pane",
            "toggle_quick_pane",
            "get_default_quick_pane_shortcut",
            "update_quick_pane_shortcut",
            "open_siga_portal",
            "desktop_update_status",
            "get_system_info",
            "pulse_turnstile_relay",
            "print_thermal_receipt_native",
            "open_external_url",
            "hardware_bridge_request",
            "get_desktop_diagnostics",
            "open_school_portal",
            "save_file",
            "print_page",
            "print_html",
            "open_payflow",
            "check_app_update",
            "install_app_update",
            "portal_store_get",
            "portal_store_set",
            "portal_store_delete",
            "portal_vault_unlock",
            "portal_vault_lock",
            "portal_vault_get",
            "portal_vault_set",
            "portal_vault_remove",
        ]));
    // tauri-winres embeds resources only in application binaries. Link the same
    // manifest into every MSVC target, including the lib unit-test executable.
    // See tauri-apps/tauri#13419 (STATUS_ENTRYPOINT_NOT_FOUND).
    let attributes = if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        let manifest = std::path::PathBuf::from(
            std::env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"),
        )
        .join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        attributes.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
    } else {
        attributes
    };
    tauri_build::try_build(attributes).expect("falha nas permissões SIGA Desktop");
}
