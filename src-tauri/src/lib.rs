mod hardware_bridge;

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

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
    let ip = ip_address
        .trim()
        .parse::<IpAddr>()
        .map_err(|_| "Indique um endereço IP de rede local válido.".to_string())?;
    let allowed = match ip {
        IpAddr::V4(v4) => v4.is_private(),
        IpAddr::V6(v6) => (v6.segments()[0] & 0xfe00) == 0xfc00,
    };
    if !allowed {
        return Err("O hardware exige um IP privado configurado; simulação e endereços públicos não são aceites.".to_string());
    }
    Ok(SocketAddr::new(ip, port))
}

/// Comando nativo Tauri 2 para disparo direto de relé de catraca via TCP Socket em Rust.
fn send_turnstile_pulse(ip_address: String, gate: u8, direction: String) -> HardwareCommandResult {
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

    if gate == 0 {
        return HardwareCommandResult {
            success: false,
            message: "A catraca deve estar entre 1 e 255.".to_string(),
            bytes_sent: 0,
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
            if stream
                .set_write_timeout(Some(Duration::from_secs(3)))
                .is_err()
            {
                return HardwareCommandResult {
                    success: false,
                    message: "Não foi possível limitar o tempo de envio.".to_string(),
                    bytes_sent: 0,
                };
            }
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
fn send_thermal_receipt(printer_ip: String, text: String) -> HardwareCommandResult {
    if text.trim().is_empty()
        || text.len() > 65536
        || text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
    {
        return HardwareCommandResult {
            success: false,
            message: "Texto de impressão inválido ou demasiado longo.".to_string(),
            bytes_sent: 0,
        };
    }

    let mut buffer = Vec::new();
    buffer.extend_from_slice(b"\x1b\x40");
    buffer.extend_from_slice(b"\x1b\x61\x01");
    buffer.extend_from_slice(text.as_bytes());
    buffer.extend_from_slice(b"\n\n\n\x1d\x56\x41\x03");

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
            if stream
                .set_write_timeout(Some(Duration::from_secs(3)))
                .is_err()
            {
                return HardwareCommandResult {
                    success: false,
                    message: "Não foi possível limitar o tempo de envio.".to_string(),
                    bytes_sent: 0,
                };
            }
            if stream.write_all(&buffer).is_ok() {
                HardwareCommandResult {
                    success: true,
                    message: format!("Rust Native: Dados enviados à impressora {}", printer_ip),
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

#[tauri::command]
async fn pulse_turnstile_relay(
    ip_address: String,
    gate: u8,
    direction: String,
) -> Result<HardwareCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || send_turnstile_pulse(ip_address, gate, direction))
        .await
        .map_err(|_| "Falha na operação nativa da catraca.".to_string())
}

#[tauri::command]
async fn print_thermal_receipt_native(
    printer_ip: String,
    text: String,
) -> Result<HardwareCommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || send_thermal_receipt(printer_ip, text))
        .await
        .map_err(|_| "Falha na operação nativa de impressão.".to_string())
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "Ligação inválida.".to_string())?;
    if !matches!(parsed.scheme(), "https" | "http" | "mailto" | "tel")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Ligação externa não permitida.".to_string());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct DesktopDiagnostics {
    version: String,
    os_type: String,
    arch: String,
    daemon_online: bool,
    daemon_message: String,
}

#[tauri::command]
async fn get_desktop_diagnostics(app: tauri::AppHandle) -> DesktopDiagnostics {
    let online = match hardware_bridge::request_daemon("/health".into(), "GET".into(), None, 8088)
        .await
    {
        Ok(response) if response.status == 200 => {
            serde_json::from_str::<serde_json::Value>(&response.body)
                .map(|data| {
                    data["service"] == "SIGA Python Hardware Bridge" && data["status"] == "online"
                })
                .unwrap_or(false)
        }
        _ => false,
    };
    DesktopDiagnostics {
        version: app.package_info().version.to_string(),
        os_type: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        daemon_online: online,
        daemon_message: if online {
            "Daemon SIGA ligado"
        } else {
            "Daemon SIGA não iniciado ou sem resposta"
        }
        .into(),
    }
}

#[tauri::command]
fn open_school_portal(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("https://portal-siga.com", None::<&str>)
        .map_err(|_| "Não foi possível abrir o portal no navegador.".into())
}

/// Retorna informações nativas da plataforma em execução.
#[tauri::command]
fn get_system_info() -> SystemInfo {
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
            let stronghold_salt_path = app.path().app_local_data_dir()?.join("stronghold-salt.txt");

            if let Some(parent) = stronghold_salt_path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&stronghold_salt_path).build(),
            )?;

            #[cfg(target_os = "macos")]
            {
                if let Ok(menu) = tauri::menu::Menu::default(app.handle()) {
                    let _ = app.set_menu(menu);
                }
            }

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                let show = MenuItem::with_id(app, "show", "Abrir SIGA", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Sair do SIGA", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;
                let icon = app
                    .default_window_icon()
                    .ok_or("Ícone da aplicação em falta")?
                    .clone();
                TrayIconBuilder::with_id("siga-tray")
                    .icon(icon)
                    .tooltip("SIGA Desktop")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            pulse_turnstile_relay,
            print_thermal_receipt_native,
            get_system_info,
            open_external_url,
            hardware_bridge::hardware_bridge_request,
            get_desktop_diagnostics,
            open_school_portal
        ]);

    #[cfg(desktop)]
    let builder = builder.on_tray_icon_event(|tray, event| {
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hardware_rejects_simulation_and_public_networks() {
        for ip in ["127.0.0.1", "localhost", "8.8.8.8", "::1", "not-an-ip"] {
            assert!(resolve_socket_address(ip, 9100).is_err());
        }
        assert!(resolve_socket_address("192.168.1.20", 9100).is_ok());
        assert!(resolve_socket_address("fd00::20", 9100).is_ok());
    }
    #[test]
    fn empty_receipt_cannot_report_success() {
        assert!(!send_thermal_receipt("192.168.1.20".into(), " ".into()).success);
    }
}
