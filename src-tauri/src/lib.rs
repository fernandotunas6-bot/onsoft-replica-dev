use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

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

/// Comando nativo Tauri 2 para disparo direto de relé de catraca via TCP Socket em Rust.
#[tauri::command]
pub fn pulse_turnstile_relay(ip_address: String, gate: u8, direction: String) -> HardwareCommandResult {
    let dir_byte = if direction == "entry" { 0x01 } else { 0x02 };
    let payload: [u8; 5] = [0x55, 0xAA, dir_byte, gate, 0x03];

    if ip_address == "127.0.0.1" || ip_address == "localhost" {
        return HardwareCommandResult {
            success: true,
            message: format!("Rust Native: Relé de {} (Catraca {}) ativado com sucesso em modo simulação.", direction.to_uppercase(), gate),
            bytes_sent: payload.len(),
        };
    }

    match TcpStream::connect_timeout(
        &format!("{}:4370", ip_address).parse().unwrap(),
        Duration::from_millis(2000),
    ) {
        Ok(mut stream) => {
            if stream.write_all(&payload).is_ok() {
                HardwareCommandResult {
                    success: true,
                    message: format!("Rust Native: Pulso de {} enviado para {}", direction.to_uppercase(), ip_address),
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
pub fn print_thermal_receipt_native(printer_ip: String, text: String) -> HardwareCommandResult {
    let mut buffer = Vec::new();
    buffer.extend_from_slice(b"\x1b\x40"); // Reset ESC/POS
    buffer.extend_from_slice(b"\x1b\x61\x01"); // Align Center
    buffer.extend_from_slice(text.as_bytes());
    buffer.extend_from_slice(b"\n\n\n\x1d\x56\x41\x03"); // Cut Paper

    if printer_ip == "127.0.0.1" || printer_ip == "localhost" {
        return HardwareCommandResult {
            success: true,
            message: "Rust Native: Recibo térmico impresso em modo simulação.".to_string(),
            bytes_sent: buffer.len(),
        };
    }

    match TcpStream::connect_timeout(
        &format!("{}:9100", printer_ip).parse().unwrap(),
        Duration::from_millis(3000),
    ) {
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

/// Retorna informações nativas do sistema operativo (Windows / macOS).
#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os_type: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_desktop_native: true,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pulse_turnstile_relay,
            print_thermal_receipt_native,
            get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação SIGA Desktop");
}
