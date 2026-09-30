use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;
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
fn pulse_turnstile_relay(
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
fn print_thermal_receipt_native(
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
fn get_system_info() -> SystemInfo {
    SystemInfo {
        os_type: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_desktop_native: cfg!(desktop),
    }
}

/// Grava um ficheiro exportado pelo SIGA (CSV, XLSX, PDF…) onde o utilizador escolher.
///
/// O corpo do pedido traz os bytes; o cabeçalho `x-file-name` o nome sugerido. O diálogo
/// abre aqui, no Rust: o webview nunca indica um caminho, por isso só se escreve na pasta
/// que a pessoa escolheu. Devolve o caminho gravado, ou `None` se cancelar.
#[tauri::command]
async fn save_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Pedido inválido: esperava o conteúdo do ficheiro.".into());
    };
    let suggested = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(|value| {
            percent_decode(value)
                .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-")
        })
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "exportacao-siga".to_string());

    let mut dialog = app.dialog().file().set_file_name(&suggested);
    if let Some(ext) = std::path::Path::new(&suggested)
        .extension()
        .and_then(|ext| ext.to_str())
    {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }

    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = chosen
        .into_path()
        .map_err(|_| "Caminho de destino inválido.".to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("Não foi possível gravar: {e}"))?;
    Ok(Some(path.display().to_string()))
}

/// Imprime a página actual pelo diálogo nativo. No macOS o `window.print()` do WKWebView
/// não faz nada; o frontend chama isto em vez dele (DesktopIntegration).
#[tauri::command]
fn print_page<R: tauri::Runtime>(webview: tauri::Webview<R>) -> Result<(), String> {
    webview.print().map_err(|e| format!("Não foi possível imprimir: {e}"))
}

/// Páginas internas servidas por `sigapage://` (id → HTML + política de segurança):
/// documentos a imprimir e o arranque do PayFlow. Cada uma vive enquanto a sua janela.
#[derive(Default)]
struct InternalPages(std::sync::Mutex<std::collections::HashMap<String, (String, String)>>);

/// Política da janela de impressão: os modelos são editáveis pela escola, por isso nenhum
/// script corre (um `<script>` num modelo não pode tocar em nada). Imagens, estilos e
/// fontes podem vir de fora (logótipo da escola no armazenamento).
const PRINT_CSP: &str = "default-src 'none'; script-src 'none'; img-src * data: blob:; \
    style-src 'unsafe-inline' *; font-src * data:";

/// Serve uma página interna, com a política de segurança dela.
fn serve_internal_page<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    let page = app
        .state::<InternalPages>()
        .0
        .lock()
        .ok()
        .and_then(|pages| pages.get(id).cloned());
    let builder =
        tauri::http::Response::builder().header("Content-Type", "text/html; charset=utf-8");
    match page {
        Some((html, csp)) => builder
            .header("Content-Security-Policy", csp)
            .status(200)
            .body(html.into_bytes()),
        None => builder
            .header("Content-Security-Policy", "default-src 'none'")
            .status(404)
            .body("Esta página já não está disponível.".as_bytes().to_vec()),
    }
    .unwrap_or_default()
}

/// Abre uma janela sem permissões Tauri (nenhuma capability cobre `<prefixo>-…`) com uma
/// página interna. Devolve a janela; a página sai da memória quando a janela fecha.
fn open_internal_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    prefix: &str,
    title: &str,
    size: (f64, f64),
    html: String,
    csp: String,
    print_on_load: bool,
) -> Result<tauri::WebviewWindow<R>, String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default()
        .to_string();
    app.state::<InternalPages>()
        .0
        .lock()
        .map_err(|_| "Janela indisponível.".to_string())?
        .insert(id.clone(), (html, csp));

    // Protocolos próprios: `http://<esquema>.localhost` no Windows, `<esquema>://` no resto.
    let url = if cfg!(windows) {
        format!("http://sigapage.localhost/{id}")
    } else {
        format!("sigapage://localhost/{id}")
    };
    let url = url.parse().map_err(|_| "Endereço interno inválido.".to_string())?;

    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        format!("{prefix}-{id}"),
        tauri::WebviewUrl::External(url),
    )
    .title(title)
    .inner_size(size.0, size.1)
    .center();
    if print_on_load {
        builder = builder.on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = webview.print();
            }
        });
    }
    let window = builder
        .build()
        .map_err(|e| format!("Não foi possível abrir a janela: {e}"))?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Ok(mut pages) = handle.state::<InternalPages>().0.lock() {
                pages.remove(&id);
            }
        }
    });
    Ok(window)
}

/// Imprime um documento oficial numa janela de pré-visualização própria.
///
/// O `iframe.print()` que o SIGA usa no browser não funciona no WKWebView (macOS). Aqui o
/// documento abre numa janela sem permissões Tauri, servido com `script-src 'none'`, e o
/// diálogo de impressão nativo abre assim que carrega. Assíncrono: criar janelas num
/// comando síncrono bloqueia no Windows.
#[tauri::command]
async fn print_html<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    html: String,
) -> Result<(), String> {
    open_internal_window(
        &app,
        "print",
        "Imprimir — SIGA",
        (880.0, 1000.0),
        html,
        PRINT_CSP.to_string(),
        true,
    )
    .map(|_| ())
}

/// Aceita só o PayFlow em HTTPS (ou localhost no desenvolvimento): a asserção assinada
/// não pode ir parar a outro sítio.
fn payflow_exchange_url(raw: &str) -> Result<tauri::Url, String> {
    let url: tauri::Url = raw
        .parse()
        .map_err(|_| "Endereço do PayFlow inválido.".to_string())?;
    let local = matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"));
    match url.scheme() {
        "https" => Ok(url),
        "http" if local => Ok(url),
        _ => Err("O PayFlow tem de usar HTTPS.".into()),
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Abre o PayFlow (administração) numa janela própria, já com sessão.
///
/// No browser o SIGA faz um POST com `target="_blank"` para a troca SSO; dentro do webview
/// essa janela nova não abre. Aqui a janela do PayFlow carrega uma página interna com o
/// mesmo formulário e submete-o sozinha: o cookie de sessão fica nessa janela e o SIGA
/// não sai do sítio. Abrir de novo fecha a janela anterior (cada asserção só serve uma vez).
#[tauri::command]
async fn open_payflow<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    exchange_url: String,
    assertion: String,
    redirect_to: Option<String>,
) -> Result<(), String> {
    let url = payflow_exchange_url(&exchange_url)?;
    let origin = url.origin().ascii_serialization();

    for (label, window) in app.webview_windows() {
        if label.starts_with("payflow-") {
            let _ = window.destroy();
        }
    }

    let html = format!(
        r#"<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>PayFlow</title>
<style>body{{margin:0;display:grid;place-items:center;height:100vh;font:14px system-ui,sans-serif;color:#6e6c78}}</style>
</head><body><p>A abrir o PayFlow…</p>
<form id="f" method="post" action="{action}">
<input type="hidden" name="assertion" value="{assertion}">
<input type="hidden" name="redirect_to" value="{redirect}">
</form><script>document.getElementById("f").submit();</script></body></html>"#,
        action = escape_html(url.as_str()),
        assertion = escape_html(&assertion),
        redirect = escape_html(redirect_to.as_deref().unwrap_or("/admin")),
    );
    // O único script é o nosso (submeter); o formulário só pode ir para o PayFlow.
    let csp = format!(
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action {origin}"
    );
    open_internal_window(
        &app,
        "payflow",
        "PayFlow — SIGA",
        (1280.0, 860.0),
        html,
        csp,
        false,
    )
    .map(|_| ())
}

/// Descodifica `%XX` (o nome vem em `encodeURIComponent`, os cabeçalhos são ASCII).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&value[i + 1..i + 3], 16) {
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

/// Mostra e foca a janela principal (tray, segunda instância).
fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Tem de ser o primeiro plugin: abrir o SIGA outra vez só foca a janela que já existe.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main_window(app);
    }));

    let builder = builder
        .setup(|app| {
            let stronghold_salt_path = app
                .path()
                .app_local_data_dir()?
                .join("stronghold-salt.txt");

            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&stronghold_salt_path).build(),
            )?;

            // O updater exige `plugins.updater` (pubkey + endpoints) no tauri.conf.json.
            // Registado sem essa configuração, a app rebentava logo ao abrir
            // ("invalid type: null, expected struct Config"). Só entra quando o
            // pipeline de releases assinadas existir e a configuração for acrescentada.
            #[cfg(desktop)]
            if app.config().plugins.0.contains_key("updater") {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

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

            // Menu do ícone da bandeja. Fechar a janela só a esconde (continua a receber
            // notificações); sem este menu não havia forma de sair da aplicação.
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

                let open = MenuItem::with_id(app, "open", "Abrir o SIGA", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Sair do SIGA", true, None::<&str>)?;
                let separator = PredefinedMenuItem::separator(app)?;
                let menu = Menu::with_items(app, &[&open, &separator, &quit])?;
                if let Some(tray) = app.tray_by_id("main") {
                    tray.set_menu(Some(menu))?;
                    tray.set_show_menu_on_left_click(false)?;
                    tray.on_menu_event(|app, event| match event.id().as_ref() {
                        "open" => show_main_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    });
                }
            }

            Ok(())
        })
        .plugin(tauri_plugin_store::Builder::new().build())
        // Só a janela principal lembra tamanho/posição (as de impressão são descartáveis).
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == "main")
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pulse_turnstile_relay,
            print_thermal_receipt_native,
            get_system_info,
            save_file,
            print_page,
            print_html,
            open_payflow
        ])
        .manage(InternalPages::default())
        .register_uri_scheme_protocol("sigapage", |ctx, request| {
            serve_internal_page(ctx.app_handle(), &request)
        });

    #[cfg(desktop)]
    let builder = builder
        .on_window_event(|window, event| {
            // Só a janela principal vai para a bandeja; as de impressão fecham de verdade.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
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
    fn payflow_so_aceita_https_ou_localhost() {
        assert!(payflow_exchange_url("https://payflow.portal-siga.com/api/v1/sso/exchange").is_ok());
        assert!(payflow_exchange_url("http://localhost:3007/api/v1/sso/exchange").is_ok());
        assert!(payflow_exchange_url("http://payflow.portal-siga.com/api").is_err());
        assert!(payflow_exchange_url("javascript:alert(1)").is_err());
        assert!(payflow_exchange_url("file:///etc/passwd").is_err());
        assert!(payflow_exchange_url("não é url").is_err());
    }

    #[test]
    fn escape_impede_sair_do_atributo() {
        assert_eq!(
            escape_html(r#"a"><script>x</script>&"#),
            "a&quot;&gt;&lt;script&gt;x&lt;/script&gt;&amp;"
        );
    }

    #[test]
    fn nomes_de_ficheiro_percent_decode() {
        assert_eq!(percent_decode("alunos%2010%C2%AA%20A.csv"), "alunos 10ª A.csv");
        assert_eq!(percent_decode("fim%4"), "fim%4");
    }
}
