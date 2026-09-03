use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

#[cfg(desktop)]
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareCommandResult {
    pub success: bool,
    pub message: String,
    pub bytes_sent: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os_type: String,
    pub arch: String,
    pub is_desktop_native: bool,
}

fn resolve_socket_address(ip_address: &str, port: u16) -> Result<SocketAddr, String> {
    format!("{}:{}", ip_address.trim(), port)
        .parse::<SocketAddr>()
        .map_err(|_| format!("Endereço de rede inválido: {}", ip_address))
}

/// Comando nativo Tauri 2 para disparo direto de relé de catraca via TCP Socket em Rust.
#[tauri::command]
pub fn pulse_turnstile_relay(
    ip_address: String,
    gate: u8,
    direction: String,
) -> HardwareCommandResult {
    let normalized_direction = direction.trim().to_ascii_lowercase();
    let dir_byte = match normalized_direction.as_str() {
        "entry" => 0x01,
        "exit" => 0x02,
        _ => {
            return HardwareCommandResult {
                success: false,
                message: format!("Direção inválida: {}. Use 'entry' ou 'exit'.", direction),
                bytes_sent: 0,
            }
        }
    };

    let payload: [u8; 5] = [0x55, 0xAA, dir_byte, gate, 0x03];

    if ip_address == "127.0.0.1" || ip_address == "localhost" {
        return HardwareCommandResult {
            success: true,
            message: format!(
                "Rust Native: Relé de {} (Catraca {}) ativado com sucesso em modo simulação.",
                normalized_direction.to_uppercase(),
                gate
            ),
            bytes_sent: payload.len(),
        };
    }

    let socket_addr = match resolve_socket_address(&ip_address, 4370) {
        Ok(addr) => addr,
        Err(message) => {
            return HardwareCommandResult {
                success: false,
                message,
                bytes_sent: 0,
            }
        }
    };

    match TcpStream::connect_timeout(&socket_addr, Duration::from_millis(2000)) {
        Ok(mut stream) => {
            if stream.write_all(&payload).is_ok() {
                HardwareCommandResult {
                    success: true,
                    message: format!(
                        "Rust Native: Pulso de {} enviado para {}",
                        normalized_direction.to_uppercase(),
                        ip_address
                    ),
                    bytes_sent: payload.len(),
                }
            } else {
                HardwareCommandResult {
                    success: false,
                    message: format!("Falha ao enviar pacote TCP para {}", ip_address),
                    bytes_sent: 0,
                }
            }
        }
        Err(e) => HardwareCommandResult {
            success: false,
            message: format!("Erro de conexão com catraca {}: {}", ip_address, e),
            bytes_sent: 0,
        },
    }
}

/// Comando nativo Tauri 2 para impressão térmica ESC/POS direta em Rust.
#[tauri::command]
pub fn print_thermal_receipt_native(
    printer_ip: String,
    text: String,
) -> HardwareCommandResult {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(b"\x1b\x40");
    buffer.extend_from_slice(b"\x1b\x61\x01");
    buffer.extend_from_slice(text.as_bytes());
    buffer.extend_from_slice(b"\n\n\n\x1d\x56\x41\x03");

    if printer_ip == "127.0.0.1" || printer_ip == "localhost" {
        return HardwareCommandResult {
            success: true,
            message: "Rust Native: Recibo térmico impresso em modo simulação.".to_string(),
            bytes_sent: buffer.len(),
        };
    }

    let socket_addr = match resolve_socket_address(&printer_ip, 9100) {
        Ok(addr) => addr,
        Err(message) => {
            return HardwareCommandResult {
                success: false,
                message,
                bytes_sent: 0,
            }
        }
    };

    match TcpStream::connect_timeout(&socket_addr, Duration::from_millis(3000)) {
        Ok(mut stream) => {
            if stream.write_all(&buffer).is_ok() {
                HardwareCommandResult {
                    success: true,
                    message: format!("Rust Native: Recibo impresso na impressora {}", printer_ip),
                    bytes_sent: buffer.len(),
                }
            } else {
                HardwareCommandResult {
                    success: false,
                    message: format!("Falha ao transmitir dados de impressão para {}", printer_ip),
                    bytes_sent: 0,
                }
            }
        }
        Err(e) => HardwareCommandResult {
            success: false,
            message: format!("Impressora térmica {} inacessível: {}", printer_ip, e),
            bytes_sent: 0,
        },
    }
}

/// Retorna informações nativas da plataforma em execução.
#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os_type: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_desktop_native: cfg!(desktop),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Ok(menu) = tauri::menu::Menu::default(app.handle()) {
                    let _ = app.set_menu(menu);
                }
            }

            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pulse_turnstile_relay,
            print_thermal_receipt_native,
            get_system_info
        ]);

    #[cfg(desktop)]
    let builder = builder
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::TrayIconEvent;

            if let TrayIconEvent::Click { .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação SIGA Native");
}
