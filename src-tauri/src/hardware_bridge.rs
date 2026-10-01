use serde::Serialize;
use std::time::Duration;

const MAX_REQUEST_BYTES: usize = 256 * 1024;
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

#[derive(Serialize)]
pub struct BridgeResponse {
    pub status: u16,
    pub body: String,
}

fn validate_request(path: &str, method: &str, body: Option<&str>) -> Result<(), String> {
    let allowed = match method {
        "GET" => {
            matches!(
                path,
                "/health"
                    | "/hardware/discover"
                    | "/hardware/allowlist"
                    | "/hardware/bridge-config"
            ) && body.is_none()
        }
        "POST" => matches!(
            path,
            "/hardware/allowlist"
                | "/hardware/bridge-config"
                | "/hardware/turnstile/open"
                | "/hardware/printer/thermal"
        ),
        _ => false,
    };
    if !allowed {
        return Err("Operação do daemon local não permitida.".into());
    }
    if method == "POST" {
        let body = body.ok_or("Envie um objecto JSON ao daemon local.")?;
        if body.len() > MAX_REQUEST_BYTES {
            return Err("Pedido ao daemon local demasiado grande.".into());
        }
        let json: serde_json::Value =
            serde_json::from_str(body).map_err(|_| "Pedido JSON inválido.".to_string())?;
        if !json.is_object() {
            return Err("Envie um objecto JSON ao daemon local.".into());
        }
    }
    Ok(())
}

// Sem URL, cabeçalhos ou destino fornecidos pelo WebView. Só o daemon loopback.
#[tauri::command]
pub async fn hardware_bridge_request(
    path: String,
    method: String,
    body: Option<String>,
) -> Result<BridgeResponse, String> {
    request_daemon(path, method, body, 8088).await
}

async fn request_daemon(
    path: String,
    method: String,
    body: Option<String>,
    port: u16,
) -> Result<BridgeResponse, String> {
    validate_request(&path, &method, body.as_deref())?;
    // O updater activa rustls-no-provider por feature unification, mesmo para HTTP.
    // Usamos o fornecedor ring já presente no lockfile. Nunca substituir um fornecedor existente.
    static CRYPTO_PROVIDER: std::sync::Once = std::sync::Once::new();
    CRYPTO_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
    let timeout = if path == "/health" { 2500 } else { 5000 };
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_millis(1500))
        .timeout(Duration::from_millis(timeout))
        .build()
        .map_err(|_| "Não foi possível iniciar a ligação ao daemon local.".to_string())?;
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| "Método inválido.".to_string())?;
    let mut request = client
        .request(method, format!("http://127.0.0.1:{port}{path}"))
        .header("Accept", "application/json")
        .header("Origin", "tauri://localhost");
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    let mut response = request.send().await
        .map_err(|_| "Daemon local inacessível ou operação sem resposta. Não repetir automaticamente uma operação física.".to_string())?;
    if response.status().is_redirection() {
        return Err("O daemon local tentou redireccionar o pedido.".into());
    }
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Resposta incompleta do daemon local.".to_string())?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("Resposta do daemon local demasiado grande.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body =
        String::from_utf8(bytes).map_err(|_| "Resposta inválida do daemon local.".to_string())?;
    serde_json::from_str::<serde_json::Value>(&body)
        .map_err(|_| "O daemon local não devolveu JSON válido.".to_string())?;
    Ok(BridgeResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_server(status: &str, body: &str) -> (u16, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let response = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: application/json\r\nLocation: http://evil.test\r\nConnection: close\r\n\r\n{body}", body.len());
        let task = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 1024];
            while !bytes.windows(4).any(|part| part == b"\r\n\r\n") {
                let size = stream.read(&mut buffer).unwrap();
                if size == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..size]);
            }
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8(bytes).unwrap()
        });
        (port, task)
    }

    #[test]
    fn native_transport_uses_loopback_and_preserves_http_errors() {
        let (port, task) = test_server("403 Forbidden", "{\"error\":\"not allowed\"}");
        let response = tauri::async_runtime::block_on(request_daemon(
            "/health".into(),
            "GET".into(),
            None,
            port,
        ))
        .unwrap();
        assert_eq!(response.status, 403);
        assert!(response.body.contains("not allowed"));
        let request = task.join().unwrap().to_lowercase();
        assert!(request.contains("origin: tauri://localhost"));
        assert!(request.starts_with("get /health http/1.1"));
    }

    #[test]
    fn native_transport_rejects_redirects_and_non_json_responses() {
        for (status, body) in [("302 Found", "{}"), ("200 OK", "not json")] {
            let (port, task) = test_server(status, body);
            assert!(tauri::async_runtime::block_on(request_daemon(
                "/health".into(),
                "GET".into(),
                None,
                port
            ))
            .is_err());
            task.join().unwrap();
        }
    }

    #[test]
    fn rejects_urls_traversal_queries_and_wrong_methods() {
        for path in [
            "http://evil.test",
            "//evil.test/health",
            "/health?next=evil",
            "/hardware/../health",
            "/webhook/turnstile-event",
        ] {
            assert!(validate_request(path, "GET", None).is_err());
            assert!(validate_request(path, "POST", Some("{}")).is_err());
        }
        assert!(validate_request("/health", "POST", Some("{}")).is_err());
        assert!(validate_request("/health", "DELETE", None).is_err());
    }

    #[test]
    fn accepts_only_bounded_json_object_writes() {
        assert!(validate_request("/hardware/allowlist", "POST", Some("{\"devices\":[]}")).is_ok());
        for body in [None, Some("[]"), Some("invalid")] {
            assert!(validate_request("/hardware/allowlist", "POST", body).is_err());
        }
        assert!(validate_request(
            "/hardware/allowlist",
            "POST",
            Some(&"x".repeat(MAX_REQUEST_BYTES + 1))
        )
        .is_err());
        assert!(validate_request("/health", "GET", Some("{}")).is_err());
        assert!(validate_request("/health", "GET", None).is_ok());
    }
}
