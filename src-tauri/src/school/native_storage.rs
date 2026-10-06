//! Armazenamento nativo do portal: definições por máquina (plugin Store) e cofre
//! cifrado (plugin Stronghold).
//!
//! O portal é uma origem remota. Os comandos dos plugins aceitam caminhos livres
//! (absolutos ou com `..`), por isso o portal não os recebe: usa estes comandos, que
//! gravam sempre nos mesmos ficheiros da pasta de dados da app. A app local (`main`)
//! recebe os plugins completos pela capability `default`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use tauri::Manager;
use tauri_plugin_store::StoreExt;
use tauri_plugin_stronghold::kdf::KeyDerivation;
use tauri_plugin_stronghold::stronghold::Stronghold;
use zeroize::Zeroize;

const STORE_FILE: &str = "siga-portal.json";
const VAULT_FILE: &str = "siga-portal.hold";
const VAULT_CLIENT: &[u8] = b"siga-auth";
/// Sal do argon2, partilhado com o plugin Stronghold da app local (`lib.rs`).
pub const SALT_FILE: &str = "siga.salt";
const SALT_LEN: u64 = 32;
const MAX_KEY_LEN: usize = 128;
const MAX_VALUE_BYTES: usize = 64 * 1024;
const MAX_STORE_KEYS: usize = 256;
const MAX_PASSWORD_LEN: usize = 1024;
/// O cofre abre com o PIN do posto: pelo menos 6 caracteres.
const MIN_PIN_LEN: usize = 6;
/// Depois de 5 PIN errados seguidos, recusar tentativas durante 1 minuto.
const MAX_FAILURES: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(60);

/// Pasta de dados locais da app, criada se ainda não existir.
pub fn local_data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Pasta de dados indisponível: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Pasta de dados indisponível: {e}"))?;
    Ok(dir)
}

fn valid_key(key: &str) -> Result<(), String> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':');
    if key.is_empty() || key.len() > MAX_KEY_LEN || !key.chars().all(allowed) {
        return Err("Chave inválida.".into());
    }
    Ok(())
}

/// O argon2 do plugin pára o processo com um sal que não tenha 32 bytes (e a release
/// usa `panic = "abort"`): recusar antes.
fn valid_salt(path: &Path) -> Result<(), String> {
    match std::fs::metadata(path) {
        Ok(meta) if meta.len() != SALT_LEN => {
            Err("O ficheiro de sal do cofre está danificado.".into())
        }
        _ => Ok(()),
    }
}

#[tauri::command]
pub(super) fn portal_store_get(
    app: tauri::AppHandle,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    valid_key(&key)?;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(store.get(&key))
}

#[tauri::command]
pub(super) fn portal_store_set(
    app: tauri::AppHandle,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    valid_key(&key)?;
    let size = serde_json::to_vec(&value).map_err(|e| e.to_string())?.len();
    if size > MAX_VALUE_BYTES {
        return Err("Valor demasiado grande para guardar.".into());
    }
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    if !store.has(&key) && store.length() >= MAX_STORE_KEYS {
        return Err("Limite de definições guardadas atingido.".into());
    }
    store.set(key, value);
    store
        .save()
        .map_err(|e| format!("Não foi possível guardar: {e}"))
}

#[tauri::command]
pub(super) fn portal_store_delete(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    valid_key(&key)?;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let removed = store.delete(&key);
    store
        .save()
        .map_err(|e| format!("Não foi possível guardar: {e}"))?;
    Ok(removed)
}

/// Cofre do portal: aberto em memória depois de `portal_vault_unlock`.
#[derive(Default)]
pub struct PortalVault {
    open: Arc<Mutex<Option<Stronghold>>>,
    attempts: Mutex<Attempts>,
}

#[derive(Default)]
struct Attempts {
    failures: u32,
    blocked_until: Option<Instant>,
}

impl Attempts {
    fn check(&self, now: Instant) -> Result<(), String> {
        match self.blocked_until {
            Some(until) if until > now => Err(format!(
                "Demasiadas tentativas com o PIN errado. Aguarde {} s.",
                (until - now).as_secs().max(1)
            )),
            _ => Ok(()),
        }
    }

    fn failed(&mut self, now: Instant) {
        self.failures += 1;
        if self.failures >= MAX_FAILURES {
            self.failures = 0;
            self.blocked_until = Some(now + LOCKOUT);
        }
    }

    fn succeeded(&mut self) {
        *self = Self::default();
    }
}

fn guard<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "O cofre ficou indisponível.".to_string())
}

fn vault_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    Ok(local_data_dir(app)?.join(VAULT_FILE))
}

/// Se o cofre do portal já foi criado neste computador (para pedir o PIN ou criá-lo).
#[tauri::command]
pub(super) fn portal_vault_exists(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(vault_path(&app)?.is_file())
}

/// Abre o cofre do portal com o PIN do posto; cria-o na primeira vez.
#[tauri::command]
pub(super) async fn portal_vault_unlock(
    app: tauri::AppHandle,
    vault: tauri::State<'_, PortalVault>,
    mut password: String,
) -> Result<(), String> {
    let length = password.chars().count();
    if password.trim().is_empty() || length < MIN_PIN_LEN || password.len() > MAX_PASSWORD_LEN {
        password.zeroize();
        return Err(format!(
            "O PIN tem de ter pelo menos {MIN_PIN_LEN} caracteres."
        ));
    }
    if let Err(error) = guard(&vault.attempts)?.check(Instant::now()) {
        password.zeroize();
        return Err(error);
    }
    let dir = local_data_dir(&app)?;
    let salt = dir.join(SALT_FILE);
    if let Err(error) = valid_salt(&salt) {
        password.zeroize();
        return Err(error);
    }
    // O argon2 é lento de propósito: fora das threads assíncronas.
    let opened = tauri::async_runtime::spawn_blocking(move || {
        let key = KeyDerivation::argon2(&password, &salt);
        password.zeroize();
        Stronghold::new(dir.join(VAULT_FILE), key)
    })
    .await
    .map_err(|_| "Falha ao abrir o cofre.".to_string())?;
    let stronghold = match opened {
        Ok(stronghold) => stronghold,
        Err(_) => {
            guard(&vault.attempts)?.failed(Instant::now());
            return Err("PIN incorrecto ou cofre danificado.".into());
        }
    };
    if stronghold.load_client(VAULT_CLIENT).is_err() {
        stronghold
            .create_client(VAULT_CLIENT)
            .map_err(|_| "Não foi possível preparar o cofre.".to_string())?;
    }
    guard(&vault.attempts)?.succeeded();
    *guard(&vault.open)? = Some(stronghold);
    Ok(())
}

/// Fecha o cofre: os segredos deixam de estar em memória até novo desbloqueio.
#[tauri::command]
pub(super) fn portal_vault_lock(vault: tauri::State<'_, PortalVault>) -> Result<(), String> {
    guard(&vault.open)?.take();
    Ok(())
}

/// «Esqueci o PIN»: fecha e apaga o cofre (perdem-se os segredos guardados, como a
/// sessão; é preciso entrar de novo). O próximo desbloqueio cria um cofre novo.
#[tauri::command]
pub(super) fn portal_vault_reset(
    app: tauri::AppHandle,
    vault: tauri::State<'_, PortalVault>,
) -> Result<(), String> {
    guard(&vault.open)?.take();
    guard(&vault.attempts)?.succeeded();
    let path = vault_path(&app)?;
    match std::fs::remove_file(&path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(format!("Não foi possível apagar o cofre: {error}"))
        }
        _ => Ok(()),
    }
}

fn with_vault<T>(
    open: &Mutex<Option<Stronghold>>,
    action: impl FnOnce(&Stronghold) -> Result<T, String>,
) -> Result<T, String> {
    let opened = guard(open)?;
    let stronghold = opened
        .as_ref()
        .ok_or_else(|| "O cofre está fechado.".to_string())?;
    action(stronghold)
}

fn client_store(stronghold: &Stronghold) -> Result<iota_stronghold::Store, String> {
    stronghold
        .get_client(VAULT_CLIENT)
        .map(|client| client.store())
        .map_err(|_| "O cofre está fechado.".to_string())
}

#[tauri::command]
pub(super) fn portal_vault_get(
    vault: tauri::State<'_, PortalVault>,
    key: String,
) -> Result<Option<String>, String> {
    valid_key(&key)?;
    with_vault(&vault.open, |stronghold| {
        let value = client_store(stronghold)?
            .get(key.as_bytes())
            .map_err(|_| "Não foi possível ler o cofre.".to_string())?;
        value
            .map(|bytes| String::from_utf8(bytes).map_err(|_| "Valor do cofre inválido.".into()))
            .transpose()
    })
}

/// Grava e cifra o ficheiro de novo (scrypt, cerca de 1 s): fora da thread principal.
async fn save_change(
    vault: &PortalVault,
    change: impl FnOnce(&Stronghold) -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
    let open = Arc::clone(&vault.open);
    tauri::async_runtime::spawn_blocking(move || {
        with_vault(&open, |stronghold| {
            change(stronghold)?;
            stronghold
                .save()
                .map_err(|_| "Não foi possível gravar o cofre.".to_string())
        })
    })
    .await
    .map_err(|_| "Falha ao gravar o cofre.".to_string())?
}

#[tauri::command]
pub(super) async fn portal_vault_set(
    vault: tauri::State<'_, PortalVault>,
    key: String,
    mut value: String,
) -> Result<(), String> {
    valid_key(&key)?;
    if value.len() > MAX_VALUE_BYTES {
        value.zeroize();
        return Err("Valor demasiado grande para o cofre.".into());
    }
    save_change(&vault, move |stronghold| {
        client_store(stronghold)?
            .insert(key.into_bytes(), value.into_bytes(), None)
            .map(|_| ())
            .map_err(|_| "Não foi possível escrever no cofre.".to_string())
    })
    .await
}

#[tauri::command]
pub(super) async fn portal_vault_remove(
    vault: tauri::State<'_, PortalVault>,
    key: String,
) -> Result<(), String> {
    valid_key(&key)?;
    save_change(&vault, move |stronghold| {
        client_store(stronghold)?
            .delete(key.as_bytes())
            .map(|_| ())
            .map_err(|_| "Não foi possível escrever no cofre.".to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_cannot_carry_paths_or_control_characters() {
        for key in ["siga-desktop-settings", "auth.session", "a:b_c-1"] {
            assert!(valid_key(key).is_ok(), "{key}");
        }
        for key in ["", "../x", "a/b", "a\\b", "a b", "ç", &"x".repeat(129)] {
            assert!(valid_key(key).is_err(), "{key}");
        }
    }

    #[test]
    fn five_wrong_pins_block_for_a_minute() {
        let start = Instant::now();
        let mut attempts = Attempts::default();
        for _ in 0..MAX_FAILURES - 1 {
            attempts.failed(start);
            assert!(attempts.check(start).is_ok());
        }
        attempts.failed(start);
        assert!(attempts.check(start).is_err());
        assert!(attempts.check(start + LOCKOUT).is_ok());
        attempts.failed(start);
        attempts.succeeded();
        assert_eq!(attempts.failures, 0);
    }

    #[test]
    fn damaged_salt_is_refused_before_argon2() {
        let dir = std::env::temp_dir().join(format!("siga-salt-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let salt = dir.join(SALT_FILE);
        assert!(valid_salt(&salt).is_ok(), "sem sal: o argon2 cria-o");
        std::fs::write(&salt, b"curto").unwrap();
        assert!(valid_salt(&salt).is_err());
        std::fs::write(&salt, [7u8; 32]).unwrap();
        assert!(valid_salt(&salt).is_ok());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn vault_round_trip_needs_the_same_password() {
        let dir = std::env::temp_dir().join(format!("siga-vault-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let salt = dir.join(SALT_FILE);
        let snapshot = dir.join(VAULT_FILE);

        let stronghold = Stronghold::new(&snapshot, KeyDerivation::argon2("certa", &salt)).unwrap();
        let client = stronghold.create_client(VAULT_CLIENT).unwrap();
        client
            .store()
            .insert(b"sessao".to_vec(), b"token".to_vec(), None)
            .unwrap();
        stronghold.save().unwrap();

        let reopened = Stronghold::new(&snapshot, KeyDerivation::argon2("certa", &salt)).unwrap();
        let client = reopened.load_client(VAULT_CLIENT).unwrap();
        assert_eq!(
            client.store().get(b"sessao").unwrap(),
            Some(b"token".to_vec())
        );
        assert!(Stronghold::new(&snapshot, KeyDerivation::argon2("errada", &salt)).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
