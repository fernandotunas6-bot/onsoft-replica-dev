fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_system_info",
            "pulse_turnstile_relay",
            "print_thermal_receipt_native",
            "open_external_url",
            "hardware_bridge_request",
            "get_desktop_diagnostics",
            "open_school_portal",
            "save_file",
        ]));
    tauri_build::try_build(attributes).expect("falha na configuração de permissões SIGA");
}
