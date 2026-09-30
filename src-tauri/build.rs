fn main() {
    // Manifesto dos comandos da app. A janela abre o SIGA publicado (origem remota),
    // e o Tauri só deixa uma origem remota chamar comandos da app com permissão
    // explícita (`allow-<comando>` na capability). Sem isto, a catraca, a impressora
    // térmica e a gravação de ficheiros eram recusadas.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_system_info",
            "pulse_turnstile_relay",
            "print_thermal_receipt_native",
            "save_file",
            "print_page",
            "print_html",
        ]),
    ))
    .expect("falha no tauri-build");
}
