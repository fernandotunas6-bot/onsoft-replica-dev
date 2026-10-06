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
        ]));
    tauri_build::try_build(attributes).expect("falha nas permissões SIGA Desktop");
}
