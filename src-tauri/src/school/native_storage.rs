//! Armazenamento nativo do portal: definições por máquina (plugin Store) e cofre
//! cifrado (plugin Stronghold).
//!
//! O portal é uma origem remota. Os comandos dos plugins aceitam caminhos livres
//! (absolutos ou com `..`), por isso o portal não os recebe: usa estes comandos, que
//! gravam sempre nos mesmos ficheiros da pasta de dados da app. A app local (`main`)
//! recebe os plugins completos pela capability `default`.

use std::path::PathBuf;
use std::sync::Mutex;

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

/// Cofre do portal, aberto em memória depois de `portal_vault_unlock`.
#[derive(Default)]
pub struct PortalVault(Mutex<Option<Stronghold>>);

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
fn valid_salt(path: &std::path::Path) -> Result<(), String> {
    match std::fs::metadata(path) {
        Ok(meta) if meta.len() != SALT_LEN => {
            Err("O ficheiro de sal do cofre está danificado.".into())
        }
        _ => Ok(()),
    }
}

fn locked<'a>(
    vault: &'a PortalVault,
) -> Result<std::sync::MutexGuard<'a, Option<Stronghold>>, String> {
    vault
        .0
        .lock()
        .map_err(|_| "O cofre ficou indisponível.".to_string())
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

/// Abre (ou cria, na primeira vez) o cofre do portal com a palavra-passe indicada.
#[tauri::command]
pub(super) async fn portal_vault_unlock(
    app: tauri::AppHandle,
    vault: tauri::State<'_, PortalVault>,
    mut password: String,
) -> Result<(), String> {
    if password.trim().is_empty() || password.len() > MAX_PASSWORD_LEN {
        password.zeroize();
        return Err("Indique uma palavra-passe válida para o cofre.".into());
    }
    let dir = local_data_dir(&app)?;
    let salt = dir.join(SALT_FILE);
    if let Err(error) = valid_salt(&salt) {
        password.zeroize();
        return Err(error);
    }
    // O argon2 é lento de propósito: fora das threads assíncronas.
    let stronghold = tauri::async_runtime::spawn_blocking(move || {
        let key = KeyDerivation::argon2(&password, &salt);
        password.zeroize();
        Stronghold::new(dir.join(VAULT_FILE), key)
    })
    .await
    .map_err(|_| "Falha ao abrir o cofre.".to_string())?
    .map_err(|_| "Palavra-passe do cofre incorrecta ou cofre danificado.".to_string())?;
    if stronghold.load_client(VAULT_CLIENT).is_err() {
        stronghold
            .create_client(VAULT_CLIENT)
            .map_err(|_| "Não foi possível preparar o cofre.".to_string())?;
    }
    *locked(&vault)? = Some(stronghold);
    Ok(())
}

/// Fecha o cofre: os segredos deixam de estar em memória até novo desbloqueio.
#[tauri::command]
pub(super) fn portal_vault_lock(vault: tauri::State<'_, PortalVault>) -> Result<(), String> {
    locked(&vault)?.take();
    Ok(())
}

fn with_vault<T>(
    vault: &PortalVault,
    action: impl FnOnce(&Stronghold) -> Result<T, String>,
) -> Result<T, String> {
    let guard = locked(vault)?;
    let stronghold = guard
        .as_ref()
        .ok_or_else(|| "O cofre está fechado.".to_string())?;
    action(stronghold)
}

#[tauri::command]
pub(super) fn portal_vault_get(
    vault: tauri::State<'_, PortalVault>,
    key: String,
) -> Result<Option<String>, String> {
    valid_key(&key)?;
    with_vault(&vault, |stronghold| {
        let client = stronghold
            .get_client(VAULT_CLIENT)
            .map_err(|_| "O cofre está fechado.".to_string())?;
        let value = client
            .store()
            .get(key.as_bytes())
            .map_err(|_| "Não foi possível ler o cofre.".to_string())?;
        value
            .map(|bytes| String::from_utf8(bytes).map_err(|_| "Valor do cofre inválido.".into()))
            .transpose()
    })
}

#[tauri::command]
pub(super) fn portal_vault_set(
    vault: tauri::State<'_, PortalVault>,
    key: String,
    mut value: String,
) -> Result<(), String> {
    valid_key(&key)?;
    if value.len() > MAX_VALUE_BYTES {
        value.zeroize();
        return Err("Valor demasiado grande para o cofre.".into());
    }
    with_vault(&vault, |stronghold| {
        let client = stronghold
            .get_client(VAULT_CLIENT)
            .map_err(|_| "O cofre está fechado.".to_string())?;
        client
            .store()
            .insert(key.into_bytes(), value.into_bytes(), None)
            .map_err(|_| "Não foi possível escrever no cofre.".to_string())?;
        stronghold
            .save()
            .map_err(|_| "Não foi possível gravar o cofre.".to_string())
    })
}

#[tauri::command]
pub(super) fn portal_vault_remove(
    vault: tauri::State<'_, PortalVault>,
    key: String,
) -> Result<(), String> {
    valid_key(&key)?;
    with_vault(&vault, |stronghold| {
        let client = stronghold
            .get_client(VAULT_CLIENT)
            .map_err(|_| "O cofre está fechado.".to_string())?;
        client
            .store()
            .delete(key.as_bytes())
            .map_err(|_| "Não foi possível escrever no cofre.".to_string())?;
        stronghold
            .save()
            .map_err(|_| "Não foi possível gravar o cofre.".to_string())
    })
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
