//! Janelas com páginas geradas pela app (`sigapage://`): documentos a imprimir.
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

#[cfg(test)]
mod tests {
    use super::*;

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
