use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Local};
use directories::ProjectDirs;
use keyring::Entry;
use serde::Serialize;
use tempfile::NamedTempFile;

use crate::models::{
    AppConfig, BatchImageRecordMetadata, ImageRecord, OutputDirectoryStateResult, OutputDirectoryTestResult,
    SaveBatchImageInput, SaveConfigInput, SaveGeneratedImageInput, SaveImageResult,
};

const KEYRING_SERVICE: &str = "chat-to-image";
const LEGACY_KEYRING_ACCOUNT: &str = "default";
const API_KEY_STORAGE_FIELD: &str = "__apiKeyStorage";
const API_KEYS_STORAGE_FIELD: &str = "__apiKeys";
const KEYRING_STORAGE_MODE: &str = "keyring";
const JSON_FALLBACK_STORAGE_MODE: &str = "json-fallback";
const OUTPUT_DIRECTORY_TEST_FILE_NAME: &str = ".chat-to-image-output-directory-test";
const OUTPUT_DIRECTORY_TEST_PREFIX: &str = "chat-to-image-output-directory-test\n";
const RESERVED_WINDOWS_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7",
    "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

static SAVE_IMAGE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static OUTPUT_DIRECTORY_TEST_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static OUTPUT_DIRECTORY_TEST_NONCE: AtomicU64 = AtomicU64::new(0);

pub fn default_config() -> AppConfig {
    AppConfig {
        base_url: "https://ruoli.dev/v1".to_string(),
        api_key: String::new(),
        remember_api_key: false,
        text_model: "gpt-5.4-mini".to_string(),
        image_model: "gpt-image-2".to_string(),
        timeout_seconds: 180,
        output_directory: "outputs".to_string(),
        default_size: "1024x1024".to_string(),
        default_count: 1,
        default_quality: "auto".to_string(),
        default_format: "png".to_string(),
        default_compression: 90,
        image_response_mode: "official".to_string(),
        ui_language: "zh-CN".to_string(),
        has_dismissed_welcome: false,
        batch_default_task_count: 5,
        batch_default_concurrency: 1,
        batch_default_interval_seconds: 20,
        batch_default_max_retries: 1,
        batch_auto_plan_task_count: true,
        batch_custom_split_system_prompt: String::new(),
        batch_last_split_template_id: "basic".to_string(),
        provider_schema_version: 1,
        active_provider_profile_id: "provider-default".to_string(),
        provider_profiles: vec![crate::models::ProviderProfileMetadata {
            id: "provider-default".to_string(),
            name: "Default provider".to_string(),
            base_url: "https://ruoli.dev/v1".to_string(),
            text_model: "gpt-5.4-mini".to_string(),
            image_model: "gpt-image-2".to_string(),
            image_response_mode: "official".to_string(),
            remember_api_key: false,
        }],
    }
}

fn project_dirs() -> Result<ProjectDirs, String> {
    ProjectDirs::from("dev", "local", "Chat To Image")
        .ok_or_else(|| "Unable to resolve application data directory.".to_string())
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(project_dirs()?.config_dir().join("config.json"))
}

pub fn history_path() -> Result<PathBuf, String> {
    Ok(project_dirs()?.data_dir().join("history.json"))
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    ensure_parent(path)?;
    let json = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "JSON output path has no parent directory.".to_string())?;
    let mut temp_file = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temp_file
        .write_all(json.as_bytes())
        .map_err(|error| error.to_string())?;
    temp_file.as_file().sync_all().map_err(|error| error.to_string())?;
    temp_file
        .persist(path)
        .map(|_| ())
        .map_err(|error| error.error.to_string())
}

fn read_json_value_result(path: &Path, subject: &str) -> Result<Option<serde_json::Value>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|error| format!("Failed to parse {subject}: {error}")),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read {subject}: {error}")),
    }
}

fn read_json_value(path: &Path) -> Option<serde_json::Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
}

fn get_string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key).and_then(|item| item.as_str()).map(ToOwned::to_owned)
}

fn get_rounded_clamped_u64(
    value: &serde_json::Value,
    key: &str,
    min: u64,
    max: u64,
) -> Option<u64> {
    value
        .get(key)
        .and_then(|item| item.as_f64())
        .filter(|item| item.is_finite())
        .map(|item| item.round().clamp(min as f64, max as f64) as u64)
}

pub fn merge_config_value(value: serde_json::Value) -> AppConfig {
    let mut config = default_config();

    if let Some(base_url) = get_string_field(&value, "baseUrl") {
        config.base_url = base_url;
    }
    if let Some(api_key) = get_string_field(&value, "apiKey") {
        config.api_key = api_key;
    }
    if let Some(remember_api_key) = value.get("rememberApiKey").and_then(|item| item.as_bool()) {
        config.remember_api_key = remember_api_key;
    }
    if let Some(text_model) = get_string_field(&value, "textModel") {
        config.text_model = text_model;
    }
    if let Some(image_model) = get_string_field(&value, "imageModel") {
        config.image_model = image_model;
    }
    if let Some(timeout_seconds) = value.get("timeoutSeconds").and_then(|item| item.as_u64()) {
        config.timeout_seconds = timeout_seconds;
    }
    if let Some(output_directory) = get_string_field(&value, "outputDirectory") {
        config.output_directory = output_directory;
    }
    if let Some(default_size) = get_string_field(&value, "defaultSize") {
        config.default_size = default_size;
    }
    config.default_count = 1;
    if let Some(default_quality) = get_string_field(&value, "defaultQuality") {
        config.default_quality = default_quality;
    }
    if let Some(default_format) = get_string_field(&value, "defaultFormat") {
        config.default_format = default_format;
    }
    if let Some(default_compression) = value
        .get("defaultCompression")
        .and_then(|item| item.as_u64())
        .and_then(|compression| u8::try_from(compression).ok())
    {
        config.default_compression = default_compression;
    }
    if let Some(image_response_mode) = get_string_field(&value, "imageResponseMode") {
        config.image_response_mode = match image_response_mode.as_str() {
            "official" | "force-base64" => image_response_mode,
            _ => "official".to_string(),
        };
    }
    if let Some(ui_language) = get_string_field(&value, "uiLanguage") {
        config.ui_language = ui_language;
    }
    if let Some(has_dismissed_welcome) = value
        .get("hasDismissedWelcome")
        .and_then(|item| item.as_bool())
    {
        config.has_dismissed_welcome = has_dismissed_welcome;
    }
    if let Some(batch_default_task_count) =
        get_rounded_clamped_u64(&value, "batchDefaultTaskCount", 1, 20)
    {
        config.batch_default_task_count = batch_default_task_count as u8;
    }
    if let Some(batch_default_concurrency) =
        get_rounded_clamped_u64(&value, "batchDefaultConcurrency", 1, 10)
    {
        config.batch_default_concurrency = batch_default_concurrency as u8;
    }
    if let Some(batch_default_interval_seconds) =
        get_rounded_clamped_u64(&value, "batchDefaultIntervalSeconds", 0, 300)
    {
        config.batch_default_interval_seconds = batch_default_interval_seconds;
    }
    if let Some(batch_default_max_retries) =
        get_rounded_clamped_u64(&value, "batchDefaultMaxRetries", 0, 3)
    {
        config.batch_default_max_retries = batch_default_max_retries as u8;
    }
    if let Some(batch_auto_plan_task_count) = value
        .get("batchAutoPlanTaskCount")
        .and_then(|item| item.as_bool())
    {
        config.batch_auto_plan_task_count = batch_auto_plan_task_count;
    }
    if let Some(batch_custom_split_system_prompt) = get_string_field(&value, "batchCustomSplitSystemPrompt") {
        config.batch_custom_split_system_prompt = batch_custom_split_system_prompt;
    }
    if let Some(batch_last_split_template_id) = get_string_field(&value, "batchLastSplitTemplateId") {
        config.batch_last_split_template_id = match batch_last_split_template_id.as_str() {
            "basic" | "style-consistent" | "series" | "custom" => batch_last_split_template_id,
            _ => "basic".to_string(),
        };
    }
    if let Some(provider_schema_version) = value.get("providerSchemaVersion").and_then(|item| item.as_u64()) {
        config.provider_schema_version = provider_schema_version as u8;
    }
    if let Some(active_provider_profile_id) = get_string_field(&value, "activeProviderProfileId") {
        config.active_provider_profile_id = active_provider_profile_id;
    }
    if let Some(provider_profiles) = value.get("providerProfiles") {
        if let Ok(provider_profiles) = serde_json::from_value::<Vec<crate::models::ProviderProfileMetadata>>(provider_profiles.clone()) {
            if !provider_profiles.is_empty() {
                config.provider_profiles = provider_profiles;
            }
        }
    }

    config
}

fn read_api_key_fallback_value(value: &serde_json::Value, profile_id: &str) -> String {
    value
        .get(API_KEYS_STORAGE_FIELD)
        .and_then(|keys| keys.get(profile_id))
        .and_then(|key| key.as_str())
        .filter(|key| !key.trim().is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_default()
}

fn read_api_key_fallback(path: &Path, profile_id: &str) -> String {
    read_json_value(path)
        .map(|value| read_api_key_fallback_value(&value, profile_id))
        .unwrap_or_default()
}

fn has_profile_api_key_fallback(path: &Path, profile_id: &str) -> bool {
    read_json_value(path)
        .and_then(|value| value.get(API_KEYS_STORAGE_FIELD).cloned())
        .and_then(|keys| keys.get(profile_id).cloned())
        .and_then(|key| key.as_str().map(|key| !key.trim().is_empty()))
        .unwrap_or(false)
}

fn read_legacy_api_key_fallback(path: &Path) -> String {
    read_json_value(path)
        .and_then(|value| get_string_field(&value, "apiKey"))
        .filter(|key| !key.trim().is_empty())
        .unwrap_or_default()
}

fn read_api_key_storage_mode(path: &Path) -> String {
    read_json_value(path)
        .and_then(|value| get_string_field(&value, API_KEY_STORAGE_FIELD))
        .unwrap_or_else(|| KEYRING_STORAGE_MODE.to_string())
}

pub fn load_api_key_with_result(
    path: &Path,
    profile_id: &str,
    keyring_result: Result<String, String>,
    legacy_keyring_result: Result<String, String>,
    allow_legacy_migration: bool,
) -> String {
    let fallback_value = read_api_key_fallback(path, profile_id);
    let legacy_fallback = read_legacy_api_key_fallback(path);

    if read_api_key_storage_mode(path) == JSON_FALLBACK_STORAGE_MODE {
        if allow_legacy_migration && !has_profile_api_key_fallback(path, profile_id) {
            if !legacy_fallback.is_empty() {
                let _ = persist_api_key_json_fallback(path, profile_id, &legacy_fallback);
                return legacy_fallback;
            }
            if let Ok(legacy_key) = legacy_keyring_result {
                if !legacy_key.trim().is_empty() {
                    let _ = persist_api_key_json_fallback(path, profile_id, &legacy_key);
                    return legacy_key;
                }
            }
        }
        return fallback_value;
    }

    match keyring_result {
        Ok(value) if !value.trim().is_empty() => value,
        _ if allow_legacy_migration => match legacy_keyring_result {
            Ok(value) if !value.trim().is_empty() => value,
            _ if !legacy_fallback.is_empty() => legacy_fallback,
            _ => fallback_value,
        },
        _ => fallback_value,
    }
}

fn profile_keyring_account(profile_id: &str) -> String {
    format!("profile:{profile_id}")
}

fn validate_profile_id(profile_id: &str) -> Result<&str, String> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty() || profile_id.len() > 128 || profile_id.contains(['/', '\\']) {
        return Err("Invalid provider profile id".to_string());
    }
    Ok(profile_id)
}

fn load_api_key(path: &Path, profile_id: &str, allow_legacy_migration: bool) -> String {
    let profile_account = profile_keyring_account(profile_id);
    let keyring_result = Entry::new(KEYRING_SERVICE, &profile_keyring_account(profile_id))
        .map_err(|error| error.to_string())
        .and_then(|entry| entry.get_password().map_err(|error| error.to_string()));
    let legacy_keyring_result = Entry::new(KEYRING_SERVICE, LEGACY_KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())
        .and_then(|entry| entry.get_password().map_err(|error| error.to_string()));

    let legacy_key = legacy_keyring_result.clone().ok().filter(|key| !key.trim().is_empty());
    let should_migrate_legacy = allow_legacy_migration
        && keyring_result.is_err()
        && legacy_key.is_some()
        && read_api_key_storage_mode(path) != JSON_FALLBACK_STORAGE_MODE;
    let loaded = load_api_key_with_result(path, profile_id, keyring_result, legacy_keyring_result, allow_legacy_migration);
    if should_migrate_legacy {
        let migrated = Entry::new(KEYRING_SERVICE, &profile_account)
            .map_err(|error| error.to_string())
            .and_then(|entry| {
                entry.set_password(legacy_key.as_deref().unwrap_or_default())
                    .map_err(|error| error.to_string())?;
                Entry::new(KEYRING_SERVICE, &profile_account)
                    .map_err(|error| error.to_string())
                    .and_then(|fresh_entry| fresh_entry.get_password().map_err(|error| error.to_string()))
            })
            .is_ok_and(|value| value == legacy_key.as_deref().unwrap_or_default());
        if migrated {
            if let Ok(entry) = Entry::new(KEYRING_SERVICE, LEGACY_KEYRING_ACCOUNT) {
                let _ = entry.delete_credential();
            }
        }
    }
    loaded
}

pub(crate) fn write_config_file(
    path: &Path,
    config: &AppConfig,
    api_key_storage_mode: &str,
) -> Result<(), String> {
    let mut value = serde_json::to_value(config).map_err(|error| error.to_string())?;
    if let Some(object) = value.as_object_mut() {
        object.remove("apiKey");
        if api_key_storage_mode == JSON_FALLBACK_STORAGE_MODE {
            if let Some(existing_keys) = read_json_value(path).and_then(|stored| stored.get(API_KEYS_STORAGE_FIELD).cloned()) {
                object.insert(API_KEYS_STORAGE_FIELD.to_string(), existing_keys);
            }
        } else {
            object.remove(API_KEYS_STORAGE_FIELD);
        }
    }
    value[API_KEY_STORAGE_FIELD] = serde_json::Value::String(api_key_storage_mode.to_string());
    write_json(path, &value)
}

pub fn should_use_keyring_storage(
    write_result: Result<(), String>,
    read_back_result: Result<String, String>,
    expected_api_key: &str,
) -> bool {
    if write_result.is_err() {
        return false;
    }

    matches!(read_back_result, Ok(read_back) if read_back == expected_api_key)
}

pub fn persist_api_key_json_fallback(path: &Path, profile_id: &str, api_key: &str) -> Result<(), String> {
    let mut value = read_json_value(path).unwrap_or_else(|| serde_json::to_value(default_config()).unwrap());
    if let Some(object) = value.as_object_mut() {
        object.remove("apiKey");
        let keys = object.entry(API_KEYS_STORAGE_FIELD).or_insert_with(|| serde_json::json!({}));
        if let Some(keys) = keys.as_object_mut() {
            keys.insert(profile_id.to_string(), serde_json::Value::String(api_key.to_string()));
        }
    }
    value[API_KEY_STORAGE_FIELD] = serde_json::Value::String(JSON_FALLBACK_STORAGE_MODE.to_string());
    write_json(path, &value)
}

pub fn clear_api_key_json_fallback(path: &Path, profile_id: &str) -> Result<(), String> {
    let Some(mut value) = read_json_value_result(path, "provider API key fallback")? else {
        return Ok(());
    };
    if let Some(object) = value.as_object_mut() {
        if let Some(keys) = object.get_mut(API_KEYS_STORAGE_FIELD).and_then(|keys| keys.as_object_mut()) {
            keys.remove(profile_id);
            if keys.is_empty() {
                object.remove(API_KEYS_STORAGE_FIELD);
            }
        }
    }
    write_json(path, &value)
}

fn read_api_key_fallback_entries(path: &Path) -> Result<Vec<(String, String)>, String> {
    let Some(value) = read_json_value_result(path, "provider API key fallback")? else {
        return Ok(Vec::new());
    };
    let Some(keys) = value.get(API_KEYS_STORAGE_FIELD) else {
        return Ok(Vec::new());
    };
    let keys = keys
        .as_object()
        .ok_or_else(|| "Provider API key fallback must be a JSON object.".to_string())?;

    keys.iter()
        .map(|(profile_id, value)| {
            value
                .as_str()
                .map(|api_key| (profile_id.clone(), api_key.to_string()))
                .ok_or_else(|| format!("Provider API key fallback for {profile_id} must be a string."))
        })
        .collect()
}

pub fn resolve_keyring_clear_result(
    delete_result: Result<(), String>,
    verify_absent_result: Result<bool, String>,
) -> Result<(), String> {
    match delete_result {
        Ok(()) => Ok(()),
        Err(delete_error) => match verify_absent_result {
            Ok(true) => Ok(()),
            Ok(false) => Err(format!(
                "Failed to clear provider API key from keyring: {delete_error}"
            )),
            Err(verify_error) => Err(format!(
                "Failed to verify provider API key removal after keyring error ({delete_error}): {verify_error}"
            )),
        },
    }
}

fn clear_api_key(path: &Path, profile_id: &str) -> Result<(), String> {
    let account = profile_keyring_account(profile_id);
    let keyring_result = match Entry::new(KEYRING_SERVICE, &account) {
        Ok(entry) => {
            let delete_result = entry
                .delete_credential()
                .map_err(|error| error.to_string());
            if delete_result.is_ok() {
                delete_result
            } else {
                let verify_absent_result = match entry.get_password() {
                    Ok(_) => Ok(false),
                    Err(keyring::Error::NoEntry) => Ok(true),
                    Err(error) => Err(error.to_string()),
                };
                resolve_keyring_clear_result(delete_result, verify_absent_result)
            }
        }
        Err(error) => Err(format!("Failed to open provider API key in keyring: {error}")),
    };
    clear_api_key_with_keyring_result(path, profile_id, keyring_result)
}

pub(crate) fn clear_api_key_with_keyring_result(
    path: &Path,
    profile_id: &str,
    keyring_result: Result<(), String>,
) -> Result<(), String> {
    let fallback_result = clear_api_key_json_fallback(path, profile_id);
    match (keyring_result, fallback_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(keyring_error), Ok(())) => Err(keyring_error),
        (Ok(()), Err(fallback_error)) => Err(fallback_error),
        (Err(keyring_error), Err(fallback_error)) => Err(format!(
            "{keyring_error}; failed to clear provider API key fallback: {fallback_error}"
        )),
    }
}

fn write_api_key_to_keyring(profile_id: &str, api_key: &str) -> Result<(), String> {
    let account = profile_keyring_account(profile_id);
    let entry = Entry::new(KEYRING_SERVICE, &account).map_err(|error| error.to_string())?;
    let write_result = entry
        .set_password(api_key)
        .map_err(|error| error.to_string());
    let read_back_result = Entry::new(KEYRING_SERVICE, &account)
        .map_err(|error| error.to_string())
        .and_then(|fresh_entry| fresh_entry.get_password().map_err(|error| error.to_string()));

    if should_use_keyring_storage(write_result, read_back_result, api_key) {
        Ok(())
    } else {
        Err("Keyring write verification failed.".to_string())
    }
}

pub(crate) fn save_api_key_with_keyring_writer<F>(
    path: &Path,
    profile_id: &str,
    api_key: &str,
    mut keyring_writer: F,
) -> Result<String, String>
where
    F: FnMut(&str, &str) -> Result<(), String>,
{
    // A profile switch can reach the native bridge before the UI has
    // hydrated that profile's secret. Never replace an existing secret with
    // an empty value; explicit clearing can be added as a separate command.
    if api_key.trim().is_empty() {
        let existing = load_api_key(path, profile_id, false);
        if !existing.trim().is_empty() {
            return Ok(read_api_key_storage_mode(path));
        }
    }

    let fallback_mode = read_api_key_storage_mode(path) == JSON_FALLBACK_STORAGE_MODE;
    let fallback_entries = if fallback_mode {
        Some(read_api_key_fallback_entries(path)?)
    } else {
        None
    };

    if keyring_writer(profile_id, api_key).is_err() {
        persist_api_key_json_fallback(path, profile_id, api_key)?;
        return Ok(JSON_FALLBACK_STORAGE_MODE.to_string());
    }

    if let Some(fallback_entries) = fallback_entries {
        for (fallback_profile_id, fallback_api_key) in fallback_entries {
            if fallback_profile_id == profile_id {
                continue;
            }
            if keyring_writer(&fallback_profile_id, &fallback_api_key).is_err() {
                persist_api_key_json_fallback(path, profile_id, api_key)?;
                return Ok(JSON_FALLBACK_STORAGE_MODE.to_string());
            }
        }
    }

    Ok(KEYRING_STORAGE_MODE.to_string())
}

fn save_api_key(path: &Path, profile_id: &str, api_key: &str) -> Result<String, String> {
    save_api_key_with_keyring_writer(path, profile_id, api_key, write_api_key_to_keyring)
}

pub fn sanitize_file_base_name(value: &str) -> String {
    let mut sanitized = String::new();
    let mut last_was_separator = false;

    for ch in value.to_lowercase().chars() {
        let normalized = if matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            || ch.is_control()
        {
            ' '
        } else {
            ch
        };

        if matches!(normalized, '\'' | '`') {
            continue;
        }

        if normalized.is_alphanumeric() {
            sanitized.push(normalized);
            last_was_separator = false;
            continue;
        }

        if !last_was_separator {
            sanitized.push('-');
            last_was_separator = true;
        }
    }

    let sanitized = sanitized.trim_matches('-').to_string();

    if sanitized.is_empty() {
        return "image".to_string();
    }

    if RESERVED_WINDOWS_NAMES.contains(&sanitized.as_str()) {
        return format!("{sanitized}-file");
    }

    sanitized
}

pub fn summarize_prompt(prompt: &str) -> String {
    sanitize_file_base_name(prompt)
        .split('-')
        .filter(|segment| !segment.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("-")
}

fn format_date_folder(date_time: DateTime<Local>) -> String {
    date_time.format("%Y-%m-%d").to_string()
}

fn format_local_time(date_time: DateTime<Local>) -> String {
    date_time.format("%H-%M-%S").to_string()
}

fn parse_generated_at(generated_at: &str) -> Result<DateTime<Local>, String> {
    DateTime::parse_from_rfc3339(generated_at)
        .map(|date_time| date_time.with_timezone(&Local))
        .map_err(|error| error.to_string())
}

fn normalize_output_directory(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');

    if trimmed.is_empty() {
        "outputs".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn resolve_output_root(value: &str, base_dir: &Path) -> PathBuf {
    let normalized = normalize_output_directory(value);
    let output_root = PathBuf::from(&normalized);

    if output_root.is_absolute() {
        output_root
    } else {
        base_dir.join(output_root)
    }
}

fn normalize_extension(value: &str) -> String {
    if value.eq_ignore_ascii_case("jpeg") {
        "jpg".to_string()
    } else {
        value.to_lowercase()
    }
}

fn existing_file_names(directory: &Path) -> Result<HashSet<String>, String> {
    let mut names = HashSet::new();

    if !directory.exists() {
        return Ok(names);
    }

    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name();
        names.insert(name.to_string_lossy().to_lowercase());
    }

    Ok(names)
}

fn build_file_name(input: &SaveGeneratedImageInput, directory: &Path) -> Result<String, String> {
    let generated_at = parse_generated_at(&input.generated_at)?;
    let extension = normalize_extension(&input.config.default_format);
    let base_name = if input.custom_name.trim().is_empty() {
        format!(
            "{}_{}",
            format_local_time(generated_at),
            summarize_prompt(&input.prompt)
        )
    } else {
        sanitize_file_base_name(&input.custom_name)
    };

    let existing = existing_file_names(directory)?;
    let initial = format!("{base_name}.{extension}");

    if !existing.contains(&initial.to_lowercase()) {
        return Ok(initial);
    }

    let mut index = 2;
    loop {
        let candidate = format!("{base_name}-{index}.{extension}");
        if !existing.contains(&candidate.to_lowercase()) {
            return Ok(candidate);
        }
        index += 1;
    }
}

fn output_base_dir() -> Result<PathBuf, String> {
    Ok(project_dirs()?.data_dir().to_path_buf())
}

#[cfg(test)]
pub fn save_config_for_test(path: &Path, profile_id: &str, api_key: &str) -> Result<String, String> {
    save_api_key(path, profile_id, api_key)
}

#[derive(Debug)]
pub struct OutputDirectoryTestFile {
    pub bytes: u64,
    pub last_tested_at: String,
}

pub fn test_output_directory_at(path: &Path) -> Result<OutputDirectoryTestFile, String> {
    let _test_guard = OUTPUT_DIRECTORY_TEST_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Output directory test lock was poisoned.".to_string())?;
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    let last_tested_at = Local::now().to_rfc3339();
    let marker_contents = format!("{OUTPUT_DIRECTORY_TEST_PREFIX}{last_tested_at}\n");
    let marker_path = build_output_directory_probe_path(path);

    let write_result = (|| -> Result<OutputDirectoryTestFile, String> {
        let mut marker_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&marker_path)
            .map_err(|error| error.to_string())?;
        marker_file
            .write_all(marker_contents.as_bytes())
            .map_err(|error| error.to_string())?;
        marker_file.sync_all().map_err(|error| error.to_string())?;
        drop(marker_file);

        let saved_contents = fs::read_to_string(&marker_path).map_err(|error| error.to_string())?;

        if saved_contents != marker_contents {
            return Err("Output directory test read-back did not match the written marker.".to_string());
        }

        write_output_directory_test_state(path, &last_tested_at)?;

        Ok(OutputDirectoryTestFile {
            bytes: saved_contents.len() as u64,
            last_tested_at,
        })
    })();
    remove_file_if_exists(&marker_path)?;

    write_result
}

pub fn read_output_directory_test_at(path: &Path) -> Result<Option<String>, String> {
    let marker_path = path.join(OUTPUT_DIRECTORY_TEST_FILE_NAME);
    ensure_regular_file_or_absent(&marker_path)?;
    let contents = match fs::read_to_string(marker_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };

    let Some(timestamp) = contents.strip_prefix(OUTPUT_DIRECTORY_TEST_PREFIX) else {
        return Ok(None);
    };
    let timestamp = timestamp.trim();

    if timestamp.is_empty() {
        return Ok(None);
    }

    if DateTime::parse_from_rfc3339(timestamp).is_err() {
        return Ok(None);
    }

    Ok(Some(timestamp.to_string()))
}

fn build_output_directory_probe_path(path: &Path) -> PathBuf {
    path.join(format!(
        ".chat-to-image-output-directory-test-probe-{}-{}",
        std::process::id(),
        unique_output_directory_probe_suffix()
    ))
}

fn unique_output_directory_probe_suffix() -> u128 {
    let time_bits = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let counter = OUTPUT_DIRECTORY_TEST_NONCE.fetch_add(1, Ordering::Relaxed) as u128;
    (time_bits << 16) ^ counter
}

fn write_output_directory_test_state(path: &Path, timestamp: &str) -> Result<(), String> {
    let marker_path = path.join(OUTPUT_DIRECTORY_TEST_FILE_NAME);
    ensure_regular_file_or_absent(&marker_path)?;
    if marker_path.exists() && read_output_directory_test_at(path)?.is_none() {
        return Err("Output directory test state is not an app-owned marker; refusing to overwrite it.".to_string());
    }
    let temp_path = path.join(format!(
        ".chat-to-image-output-directory-test-state-{}-{}.tmp",
        std::process::id(),
        unique_output_directory_probe_suffix()
    ));
    let contents = format!("{OUTPUT_DIRECTORY_TEST_PREFIX}{timestamp}\n");

    let mut temp_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|error| error.to_string())?;
    temp_file
        .write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    temp_file.sync_all().map_err(|error| error.to_string())?;
    drop(temp_file);

    if marker_path.exists() {
        fs::remove_file(&marker_path).map_err(|error| error.to_string())?;
    }

    match fs::rename(&temp_path, &marker_path) {
        Ok(()) => Ok(()),
        Err(error) => {
            let _ = fs::remove_file(&temp_path);
            Err(error.to_string())
        }
    }
}

fn ensure_regular_file_or_absent(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            let file_type = metadata.file_type();
            if file_type.is_symlink() {
                return Err(format!(
                    "Output directory test state must not be a symlink: {}",
                    path.display()
                ));
            }

            if !file_type.is_file() {
                return Err(format!(
                    "Output directory test state must be a regular file: {}",
                    path.display()
                ));
            }

            Ok(())
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn image_output_directory_at(input: &SaveGeneratedImageInput, output_base: &Path) -> Result<PathBuf, String> {
    let generated_at = parse_generated_at(&input.generated_at)?;
    let output_root = resolve_output_root(&input.config.output_directory, output_base);
    Ok(output_root.join(format_date_folder(generated_at)))
}

pub fn batch_directory_name(created_at: &str, title: &str) -> Result<String, String> {
    let date_time = parse_generated_at(created_at)?;
    Ok(format!(
        "{}-{}-batch-{}",
        format_date_folder(date_time),
        date_time.format("%H%M%S"),
        sanitize_file_base_name(title)
    ))
}

fn batch_output_directory_at(input: &SaveBatchImageInput, output_base: &Path) -> Result<PathBuf, String> {
    let output_root = resolve_output_root(&input.config.output_directory, output_base);
    Ok(output_root.join(batch_directory_name(&input.batch_created_at, &input.batch_title)?))
}

fn build_batch_file_name(input: &SaveBatchImageInput, directory: &Path) -> Result<String, String> {
    let extension = normalize_extension(&input.config.default_format);
    let base_title = if input.task.title.trim().is_empty() {
        &input.task.prompt
    } else {
        &input.task.title
    };
    let base_name = format!("{:03}-{}", input.task.index + 1, sanitize_file_base_name(base_title));
    let existing = existing_file_names(directory)?;
    let initial = format!("{base_name}.{extension}");
    if !existing.contains(&initial.to_lowercase()) {
        return Ok(initial);
    }

    let mut index = 2;
    loop {
        let candidate = format!("{base_name}-{index}.{extension}");
        if !existing.contains(&candidate.to_lowercase()) {
            return Ok(candidate);
        }
        index += 1;
    }
}

fn create_record(input: SaveGeneratedImageInput, output_path: &Path) -> ImageRecord {
    let image_model = active_image_model(&input.config);
    ImageRecord {
        id: unique_id(),
        status: "success".to_string(),
        created_at: input.generated_at,
        prompt: input.prompt,
        optimized_prompt: input.optimized_prompt,
        model: image_model,
        size: input.config.default_size,
        output_path: output_path.to_string_lossy().to_string(),
        duration_ms: input.duration_ms,
        provider_profile_snapshot: input.provider_profile_snapshot,
        error_message: None,
        batch: None,
    }
}

fn unique_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{millis}-{}", std::process::id())
}

fn sort_history(records: &mut [ImageRecord]) {
    records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
}

pub fn parse_history_json(raw: &str) -> Vec<ImageRecord> {
    serde_json::from_str(raw).unwrap_or_default()
}

pub fn load_config_from_path(path: &Path) -> Result<AppConfig, String> {
    match read_json_value_result(path, "config.json")? {
        Some(value) if value.is_object() => Ok(merge_config_value(value)),
        Some(_) => Err("Failed to parse config.json: config root must be a JSON object".to_string()),
        None => Ok(default_config()),
    }
}

fn load_history_for_display(path: &Path) -> Result<Vec<ImageRecord>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => Ok(parse_history_json(&raw)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Failed to read history.json: {error}")),
    }
}

pub fn load_history_for_save(path: &Path) -> Result<Vec<ImageRecord>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map_err(|error| format!("Failed to parse history.json: {error}")),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Failed to read history.json: {error}")),
    }
}

pub(crate) fn load_config_at(path: &Path) -> Result<AppConfig, String> {
    let raw = read_json_value(path);
    let has_legacy_api_key = raw.as_ref().and_then(|value| get_string_field(value, "apiKey"))
        .map(|key| !key.trim().is_empty()).unwrap_or(false);
    let allow_legacy_migration = raw.as_ref().map(|value| {
        let profiles = value.get("providerProfiles").and_then(|profiles| profiles.as_array());
        profiles.map(|profiles| profiles.is_empty()).unwrap_or(true)
            || (has_legacy_api_key && profiles.map(|profiles| profiles.iter().any(|profile| {
                profile.get("id").and_then(|id| id.as_str()) == value.get("activeProviderProfileId").and_then(|id| id.as_str())
            })).unwrap_or(false))
    }).unwrap_or(true);
    let mut config = load_config_from_path(path)?;
    config.api_key = load_api_key(path, &config.active_provider_profile_id, allow_legacy_migration);
    if has_legacy_api_key {
        let mode = save_api_key(path, &config.active_provider_profile_id, &config.api_key)?;
        write_config_file(path, &config, &mode)?;
    }
    Ok(config)
}

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    load_config_at(&config_path()?)
}

#[tauri::command]
pub fn load_provider_api_key(profile_id: String) -> Result<String, String> {
    let profile_id = validate_profile_id(&profile_id)?;
    let path = config_path()?;
    Ok(load_api_key(&path, profile_id, false))
}

#[tauri::command]
pub fn clear_provider_api_key(profile_id: String) -> Result<(), String> {
    let profile_id = validate_profile_id(&profile_id)?;
    clear_api_key(&config_path()?, profile_id)
}

#[tauri::command]
pub fn save_config(input: SaveConfigInput) -> Result<(), String> {
    let path = config_path()?;
    let api_key_storage_mode = save_api_key(
        &path,
        &input.config.active_provider_profile_id,
        &input.active_profile_api_key,
    )?;
    write_config_file(&path, &input.config, &api_key_storage_mode)
}

#[tauri::command]
pub fn load_history() -> Result<Vec<ImageRecord>, String> {
    let path = history_path()?;
    let mut history = load_history_for_display(&path)?;
    sort_history(&mut history);
    Ok(history)
}

#[tauri::command]
pub fn delete_history_records(record_ids: Vec<String>) -> Result<Vec<ImageRecord>, String> {
    let path = history_path()?;
    let record_id_set: HashSet<String> = record_ids.into_iter().collect();
    let mut history = load_history_for_save(&path)?
        .into_iter()
        .filter(|record| !record_id_set.contains(&record.id))
        .collect::<Vec<_>>();
    sort_history(&mut history);
    write_json(&path, &history)?;
    Ok(history)
}

fn active_image_model(config: &AppConfig) -> String {
    config
        .provider_profiles
        .iter()
        .find(|profile| profile.id == config.active_provider_profile_id)
        .map(|profile| profile.image_model.clone())
        .unwrap_or_else(|| config.image_model.clone())
}

#[tauri::command]
pub fn test_output_directory(output_directory: String) -> Result<OutputDirectoryTestResult, String> {
    let output_root = resolve_output_root(&output_directory, &output_base_dir()?);
    let result = test_output_directory_at(&output_root)?;

    Ok(OutputDirectoryTestResult {
        ok: true,
        file_name: Some(OUTPUT_DIRECTORY_TEST_FILE_NAME.to_string()),
        bytes: Some(result.bytes),
        last_tested_at: Some(result.last_tested_at),
        message: None,
    })
}

#[tauri::command]
pub fn get_output_directory_state() -> Result<OutputDirectoryStateResult, String> {
    let config = load_config()?;
    let name = normalize_output_directory(&config.output_directory);
    let output_root = resolve_output_root(&name, &output_base_dir()?);
    let last_tested_at = read_output_directory_test_at(&output_root)?;

    Ok(match last_tested_at {
        Some(last_tested_at) => OutputDirectoryStateResult {
            status: "ready".to_string(),
            name: Some(name),
            last_tested_at: Some(last_tested_at),
        },
        None => OutputDirectoryStateResult {
            status: "permission-required".to_string(),
            name: Some(name),
            last_tested_at: None,
        },
    })
}

#[tauri::command]
pub fn save_generated_image(input: SaveGeneratedImageInput) -> Result<SaveImageResult, String> {
    let _save_guard = SAVE_IMAGE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Save image lock was poisoned.".to_string())?;
    save_generated_image_at(input, &output_base_dir()?, &history_path()?)
}

pub fn save_generated_image_at(
    input: SaveGeneratedImageInput,
    output_base: &Path,
    history_file: &Path,
) -> Result<SaveImageResult, String> {
    let directory = image_output_directory_at(&input, output_base)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let file_name = build_file_name(&input, &directory)?;
    let output_path = directory.join(file_name);
    let bytes = STANDARD
        .decode(input.image_base64.as_bytes())
        .map_err(|error| error.to_string())?;
    write_new_file(&output_path, &bytes)?;

    let record = create_record(input, &output_path);
    commit_history_record(history_file, record.clone(), &output_path)?;

    Ok(SaveImageResult {
        preview_url: output_path.to_string_lossy().to_string(),
        record,
        save_mode: "authorized-directory".to_string(),
        history_durability: "persistent".to_string(),
        history_warning: None,
    })
}

#[tauri::command]
pub fn save_batch_image(input: SaveBatchImageInput) -> Result<SaveImageResult, String> {
    let _save_guard = SAVE_IMAGE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Save image lock was poisoned.".to_string())?;
    save_batch_image_at(input, &output_base_dir()?, &history_path()?)
}

pub fn save_batch_image_at(
    input: SaveBatchImageInput,
    output_base: &Path,
    history_file: &Path,
) -> Result<SaveImageResult, String> {
    let directory = batch_output_directory_at(&input, output_base)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let file_name = build_batch_file_name(&input, &directory)?;
    let output_path = directory.join(file_name);
    let bytes = STANDARD
        .decode(input.image_base64.as_bytes())
        .map_err(|error| error.to_string())?;
    write_new_file(&output_path, &bytes)?;

    let record = ImageRecord {
        model: active_image_model(&input.config),
        id: unique_id(),
        status: "success".to_string(),
        created_at: input.generated_at,
        prompt: input.task.prompt,
        optimized_prompt: String::new(),
        size: input.config.default_size,
        output_path: output_path.to_string_lossy().to_string(),
        duration_ms: input.duration_ms,
        provider_profile_snapshot: input.provider_profile_snapshot,
        error_message: None,
        batch: Some(BatchImageRecordMetadata {
            id: input.batch_id,
            title: input.batch_title,
            created_at: input.batch_created_at,
            task_id: input.task.id,
            task_index: input.task.index,
            task_title: input.task.title,
            total_tasks: input.total_tasks,
        }),
    };
    commit_history_record(history_file, record.clone(), &output_path)?;

    Ok(SaveImageResult {
        preview_url: output_path.to_string_lossy().to_string(),
        record,
        save_mode: "authorized-directory".to_string(),
        history_durability: "persistent".to_string(),
        history_warning: None,
    })
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

fn commit_history_record(
    history_file: &Path,
    record: ImageRecord,
    output_path: &Path,
) -> Result<(), String> {
    let history_result = (|| {
        let mut history = load_history_for_save(history_file)?;
        history.push(record);
        sort_history(&mut history);
        write_json(history_file, &history)
    })();

    match history_result {
        Ok(()) => Ok(()),
        Err(error) => Err(format_history_commit_failure(error, fs::remove_file(output_path))),
    }
}

pub fn format_history_commit_failure(
    history_error: String,
    rollback_result: std::io::Result<()>,
) -> String {
    match rollback_result {
        Ok(()) => format!(
            "History commit failed after image write; the saved image was removed. {history_error}"
        ),
        Err(rollback_error) => format!(
            "History commit failed after image write, and image rollback also failed: {rollback_error}. {history_error}"
        ),
    }
}

#[tauri::command]
pub fn save_batch_manifest(manifest: serde_json::Value) -> Result<String, String> {
    let created_at = manifest
        .get("createdAt")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "manifest.createdAt is required".to_string())?;
    let title = manifest
        .get("title")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "manifest.title is required".to_string())?;
    let config = load_config()?;
    let output_root = resolve_output_root(&config.output_directory, &output_base_dir()?);
    let directory = output_root.join(batch_directory_name(created_at, title)?);
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let output_path = directory.join("manifest.json");
    write_json(&output_path, &manifest)?;
    Ok(output_path.to_string_lossy().to_string())
}
