//! Janelas com páginas geradas pela app (`sigapage://`): documentos a imprimir e o
//! arranque do PayFlow com sessão.
//!
//! Cada janela tem o rótulo `<prefixo>-<id>` e nenhuma capability a cobre (todas
//! listam só `main`): as páginas não chamam comandos da app. Cada página é servida
//! com a sua política de segurança e sai da memória quando a janela fecha.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::Manager;

/// Maior documento aceite numa página interna.
const MAX_PAGE_BYTES: usize = 5 * 1024 * 1024;

/// Política da janela de impressão: os modelos são editáveis pela escola, por isso
/// nenhum script corre (um `<script>` num modelo não pode tocar em nada). Imagens,
/// estilos e fontes podem vir de fora (logótipo da escola no armazenamento).
pub const PRINT_CSP: &str = "default-src 'none'; script-src 'none'; img-src * data: blob:; \
    style-src 'unsafe-inline' *; font-src * data:";

/// Páginas internas abertas: id → (HTML, política de segurança).
#[derive(Default)]
pub struct InternalPages(Mutex<HashMap<String, (String, String)>>);

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn next_page_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    format!("{nanos:x}{:x}", NEXT_ID.fetch_add(1, Ordering::Relaxed))
}

/// Serve uma página interna com a política de segurança dela.
pub fn serve<R: tauri::Runtime>(
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

/// Endereço de uma página interna: `http://sigapage.localhost/` no Windows,
/// `sigapage://localhost/` nos outros sistemas.
fn page_url(id: &str) -> String {
    if cfg!(windows) {
        format!("http://sigapage.localhost/{id}")
    } else {
        format!("sigapage://localhost/{id}")
    }
}

/// Abre uma janela sem permissões da app com uma página interna.
pub fn open_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    prefix: &str,
    title: &str,
    size: (f64, f64),
    html: String,
    csp: String,
    print_on_load: bool,
) -> Result<tauri::WebviewWindow<R>, String> {
    if html.len() > MAX_PAGE_BYTES {
        return Err("O documento é demasiado grande para abrir.".into());
    }
    let id = next_page_id();
    app.state::<InternalPages>()
        .0
        .lock()
        .map_err(|_| "Janela indisponível.".to_string())?
        .insert(id.clone(), (html, csp));

    let url = page_url(&id)
        .parse()
        .map_err(|_| "Endereço interno inválido.".to_string())?;
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
    let window = match builder.build() {
        Ok(window) => window,
        Err(e) => {
            if let Ok(mut pages) = app.state::<InternalPages>().0.lock() {
                pages.remove(&id);
            }
            return Err(format!("Não foi possível abrir a janela: {e}"));
        }
    };

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

/// Imprime a página actual pelo diálogo nativo. No macOS o `window.print()` do
/// WKWebView não faz nada; o frontend chama isto em vez dele.
#[tauri::command]
pub fn print_page(webview: tauri::Webview) -> Result<(), String> {
    webview
        .print()
        .map_err(|e| format!("Não foi possível imprimir: {e}"))
}

/// Imprime um documento oficial numa janela de pré-visualização própria.
///
/// O `iframe.print()` que o SIGA usa no browser não funciona no WKWebView (macOS).
/// Aqui o documento abre numa janela sem permissões da app, servido com
/// `script-src 'none'`, e o diálogo de impressão nativo abre assim que carrega.
/// Assíncrono: criar janelas num comando síncrono bloqueia no Windows.
#[tauri::command]
pub async fn print_html(app: tauri::AppHandle, html: String) -> Result<(), String> {
    open_window(
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

/// Origem do PayFlow em produção (`https://payflow.<PLATFORM_DOMAIN>`).
const PAYFLOW_ORIGIN: &str = "https://payflow.portal-siga.com";
const PAYFLOW_EXCHANGE_PATH: &str = "/api/v1/sso/exchange";
/// Maior asserção SSO aceite (as do SIGA têm poucas centenas de caracteres).
const MAX_ASSERTION_LEN: usize = 8192;

/// A asserção assinada só pode ir para a troca SSO do PayFlow oficial (em
/// desenvolvimento, também para o PayFlow local).
fn payflow_exchange_url(raw: &str) -> Result<tauri::Url, String> {
    let invalid = || "Endereço do PayFlow inválido.".to_string();
    let url: tauri::Url = raw.parse().map_err(|_| invalid())?;
    if url.path() != PAYFLOW_EXCHANGE_PATH
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(invalid());
    }
    let local = cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"));
    if url.origin().ascii_serialization() == PAYFLOW_ORIGIN || local {
        Ok(url)
    } else {
        Err("O PayFlow só abre no endereço oficial.".into())
    }
}

/// Destino depois da troca: só um caminho dentro do PayFlow.
fn payflow_redirect(path: Option<&str>) -> String {
    match path {
        Some(p)
            if p.starts_with('/')
                && !p.starts_with("//")
                && !p.contains('\\')
                && p.len() <= 200 =>
        {
            p.to_string()
        }
        _ => "/admin".to_string(),
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
/// No browser o SIGA faz um POST com `target="_blank"` para a troca SSO; dentro do
/// webview essa janela nova não abre. Aqui a janela do PayFlow carrega uma página
/// interna com o mesmo formulário e submete-o: o cookie de sessão fica nessa janela
/// e o SIGA não sai do sítio. Abrir de novo fecha a anterior (cada asserção só
/// serve uma vez).
#[tauri::command]
pub async fn open_payflow(
    app: tauri::AppHandle,
    exchange_url: String,
    assertion: String,
    redirect_to: Option<String>,
) -> Result<(), String> {
    let url = payflow_exchange_url(&exchange_url)?;
    if assertion.trim().is_empty() || assertion.len() > MAX_ASSERTION_LEN {
        return Err("Sessão do PayFlow inválida.".into());
    }
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
        redirect = escape_html(&payflow_redirect(redirect_to.as_deref())),
    );
    // O único script é o nosso (submeter); o formulário só pode ir para o PayFlow.
    let csp = format!(
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action {origin}"
    );
    open_window(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payflow_assertion_only_goes_to_the_official_exchange() {
        assert!(
            payflow_exchange_url("https://payflow.portal-siga.com/api/v1/sso/exchange").is_ok()
        );
        for bad in [
            "http://payflow.portal-siga.com/api/v1/sso/exchange",
            "https://payflow.portal-siga.com.mal.example/api/v1/sso/exchange",
            "https://mal.example/api/v1/sso/exchange",
            "https://payflow.portal-siga.com/admin",
            "https://payflow.portal-siga.com/api/v1/sso/exchange?x=1",
            "https://user@payflow.portal-siga.com/api/v1/sso/exchange",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "não é url",
        ] {
            assert!(payflow_exchange_url(bad).is_err(), "{bad}");
        }
        // O PayFlow local só nas builds de desenvolvimento.
        assert_eq!(
            payflow_exchange_url("http://localhost:3007/api/v1/sso/exchange").is_ok(),
            cfg!(debug_assertions)
        );
    }

    #[test]
    fn payflow_redirect_stays_inside_payflow() {
        assert_eq!(payflow_redirect(Some("/admin/caixa")), "/admin/caixa");
        assert_eq!(payflow_redirect(Some("//mal.example")), "/admin");
        assert_eq!(payflow_redirect(Some("https://mal.example")), "/admin");
        assert_eq!(payflow_redirect(Some("/\\mal.example")), "/admin");
        assert_eq!(payflow_redirect(None), "/admin");
    }

    #[test]
    fn escaped_values_cannot_leave_the_attribute() {
        assert_eq!(
            escape_html(r#"a"><script>x</script>&"#),
            "a&quot;&gt;&lt;script&gt;x&lt;/script&gt;&amp;"
        );
    }

    #[test]
    fn print_pages_run_no_scripts() {
        assert!(PRINT_CSP.starts_with("default-src 'none'; script-src 'none';"));
        assert!(!PRINT_CSP.contains("'unsafe-eval'"));
    }

    #[test]
    fn page_ids_are_unique_and_path_safe() {
        let a = next_page_id();
        let b = next_page_id();
        assert_ne!(a, b);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn page_urls_use_the_internal_scheme() {
        let url = page_url("abc");
        assert!(url.ends_with("/abc"));
        assert!(url.starts_with("sigapage://") || url.starts_with("http://sigapage.localhost/"));
    }
}
