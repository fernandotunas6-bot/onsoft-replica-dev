mod hardware_bridge;
mod internal_pages;

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
pub(super) async fn open_school_portal(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("school") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "school",
        tauri::WebviewUrl::External(
            "https://portal-siga.com"
                .parse()
                .map_err(|_| "Endereço SIGA inválido")?,
        ),
    )
    .title("SIGA Plus — Gestão Escolar")
    .inner_size(1280.0, 832.0)
    .min_inner_size(1024.0, 700.0)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| format!("Não foi possível abrir o SIGA: {e}"))
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

/// Maior ficheiro exportado que a app grava (CSV, XLSX, PDF, ICS…).
const MAX_SAVE_BYTES: usize = 50 * 1024 * 1024;

/// Descodifica `%XX` (o nome chega em `encodeURIComponent`; os cabeçalhos são ASCII).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            // Pelos bytes: cortar a `str` a meio de um carácter fazia o Rust parar.
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Nome sugerido no «Guardar como»: sem separadores de caminho, sem caracteres que o
/// Windows recusa e sem pontos ou espaços nas pontas.
fn safe_file_name(raw: Option<&str>) -> String {
    let decoded = raw.map(percent_decode).unwrap_or_default();
    let cleaned: String = decoded
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .take(180)
        .collect();
    let trimmed = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        "exportacao-siga".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Grava um ficheiro exportado pelo SIGA onde a pessoa escolher.
///
/// O WKWebView (macOS) e o WebKitGTK (Linux) ignoram `<a download href="blob:…">`, por
/// isso o frontend envia os bytes no corpo e o nome no cabeçalho `x-file-name`. O
/// diálogo abre aqui, no Rust: a página nunca indica um caminho, só se escreve no sítio
/// que a pessoa escolheu. Devolve o caminho gravado, ou `None` se cancelar.
#[tauri::command]
async fn save_file(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Pedido inválido: esperava o conteúdo do ficheiro.".into());
    };
    if bytes.is_empty() || bytes.len() > MAX_SAVE_BYTES {
        return Err("O ficheiro está vazio ou é demasiado grande para guardar.".into());
    }
    let bytes = bytes.clone();
    let name = safe_file_name(
        request
            .headers()
            .get("x-file-name")
            .and_then(|value| value.to_str().ok()),
    );
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(ext) = std::path::Path::new(&name)
        .extension()
        .and_then(|ext| ext.to_str())
    {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }
    // O diálogo bloqueia até a pessoa escolher: fora das threads assíncronas.
    tauri::async_runtime::spawn_blocking(move || {
        let Some(chosen) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let path = chosen
            .into_path()
            .map_err(|_| "Caminho de destino inválido.".to_string())?;
        std::fs::write(&path, bytes).map_err(|e| format!("Não foi possível gravar: {e}"))?;
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|_| "Falha ao guardar o ficheiro.".to_string())?
}

/// O plugin do updater só arranca com `plugins.updater` preenchido (chave pública).
/// Sem isso, registá-lo faz a app terminar logo ao abrir.
pub(super) fn updater_configured(plugins: &tauri::utils::config::PluginConfig) -> bool {
    plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|pubkey| pubkey.as_str())
        .is_some_and(|pubkey| !pubkey.trim().is_empty())
}

/// Estado das actualizações da app, para o aviso «Nova versão do SIGA».
#[derive(Serialize, specta::Type)]
pub(super) struct AppUpdate {
    configured: bool,
    available: bool,
    version: Option<String>,
    notes: Option<String>,
}

/// Procura uma versão nova (release publicada e assinada). Sem chave pública
/// configurada nesta versão da app, responde `configured: false` sem ir à rede.
#[tauri::command]
pub(super) async fn check_app_update(app: tauri::AppHandle) -> Result<AppUpdate, String> {
    let none = |configured| AppUpdate {
        configured,
        available: false,
        version: None,
        notes: None,
    };
    if !updater_configured(&app.config().plugins) {
        return Ok(none(false));
    }
    use tauri_plugin_updater::UpdaterExt;
    let update = app
        .updater()
        .map_err(|e| format!("Actualizações indisponíveis: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Não foi possível verificar se há versão nova: {e}"))?;
    Ok(match update {
        Some(update) => AppUpdate {
            configured: true,
            available: true,
            version: Some(update.version.clone()),
            notes: update.body.clone(),
        },
        None => none(true),
    })
}

/// Descarrega, verifica a assinatura, instala e reinicia. Só quando a pessoa
/// carrega em «Instalar e reiniciar»; o frontend recusa com gravações por enviar.
#[tauri::command]
async fn install_app_update(app: tauri::AppHandle) -> Result<(), String> {
    if !updater_configured(&app.config().plugins) {
        return Err("As actualizações automáticas não estão configuradas nesta versão.".into());
    }
    use tauri_plugin_updater::UpdaterExt;
    let Some(update) = app
        .updater()
        .map_err(|e| format!("Actualizações indisponíveis: {e}"))?
        .check()
        .await
        .map_err(|e| format!("Não foi possível verificar se há versão nova: {e}"))?
    else {
        return Err("Já tem a versão mais recente do SIGA.".into());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Não foi possível instalar a versão nova: {e}"))?;
    app.restart()
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
    #[test]
    fn updater_only_with_public_key() {
        use tauri::utils::config::PluginConfig;
        let mut plugins = PluginConfig::default();
        assert!(!updater_configured(&plugins));
        plugins.0.insert(
            "updater".into(),
            serde_json::json!({ "pubkey": " ", "endpoints": [] }),
        );
        assert!(!updater_configured(&plugins));
        plugins.0.insert(
            "updater".into(),
            serde_json::json!({ "pubkey": "chave", "endpoints": ["https://exemplo/latest.json"] }),
        );
        assert!(updater_configured(&plugins));
    }
    #[test]
    fn saved_file_names_cannot_escape_the_chosen_folder() {
        assert_eq!(
            safe_file_name(Some("alunos%2010%C2%AA%20A.csv")),
            "alunos 10ª A.csv"
        );
        assert_eq!(
            safe_file_name(Some("..%2F..%2Fetc%2Fpasswd")),
            "-..-etc-passwd"
        );
        assert_eq!(
            safe_file_name(Some("C:\\Windows\\x.exe")),
            "C--Windows-x.exe"
        );
        assert_eq!(safe_file_name(Some(" ... ")), "exportacao-siga");
        assert_eq!(safe_file_name(None), "exportacao-siga");
        assert_eq!(percent_decode("fim%4"), "fim%4");
        assert_eq!(percent_decode("%aé%é"), "%aé%é");
    }
}

/// Compatibility adapter for the school portal's existing IPC contracts.
/// The native template itself uses the typed commands generated by tauri-specta.
pub fn handle(invoke: tauri::ipc::Invoke) -> bool {
    let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
        pulse_turnstile_relay,
        print_thermal_receipt_native,
        get_system_info,
        open_external_url,
        hardware_bridge::hardware_bridge_request,
        get_desktop_diagnostics,
        open_school_portal,
        save_file,
        internal_pages::print_page,
        internal_pages::print_html,
        internal_pages::open_payflow,
        check_app_update,
        install_app_update
    ];
    handler(invoke)
}

pub fn setup(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
        .manage(internal_pages::InternalPages::default())
        .register_uri_scheme_protocol("sigapage", |ctx, request| {
            internal_pages::serve(ctx.app_handle(), &request)
        })
}
