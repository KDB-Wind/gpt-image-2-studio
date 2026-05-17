use std::{
    collections::HashSet,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Local};
use directories::ProjectDirs;
use keyring::Entry;
use serde::Serialize;

use crate::models::{AppConfig, ImageRecord, SaveGeneratedImageInput, SaveImageResult};

const KEYRING_SERVICE: &str = "chat-to-image";
const KEYRING_ACCOUNT: &str = "default";
const API_KEY_STORAGE_FIELD: &str = "__apiKeyStorage";
const KEYRING_STORAGE_MODE: &str = "keyring";
const JSON_FALLBACK_STORAGE_MODE: &str = "json-fallback";
const RESERVED_WINDOWS_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7",
    "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

static SAVE_IMAGE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub fn default_config() -> AppConfig {
    AppConfig {
        base_url: "https://ruoli.dev/v1".to_string(),
        api_key: String::new(),
        text_model: "gpt-5.4-mini".to_string(),
        image_model: "gpt-image-2".to_string(),
        timeout_seconds: 180,
        output_directory: "outputs".to_string(),
        default_size: "1024x1024".to_string(),
        default_count: 1,
        default_quality: "auto".to_string(),
        default_format: "png".to_string(),
        default_compression: 90,
        ui_language: "zh-CN".to_string(),
        has_dismissed_welcome: false,
        batch_default_concurrency: 1,
        batch_default_interval_seconds: 20,
        batch_default_max_retries: 1,
        batch_custom_split_system_prompt: String::new(),
        batch_last_split_template_id: "basic".to_string(),
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
    fs::write(path, json).map_err(|error| error.to_string())
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

pub fn merge_config_value(value: serde_json::Value) -> AppConfig {
    let mut config = default_config();

    if let Some(base_url) = get_string_field(&value, "baseUrl") {
        config.base_url = base_url;
    }
    if let Some(api_key) = get_string_field(&value, "apiKey") {
        config.api_key = api_key;
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
    if let Some(default_count) = value
        .get("defaultCount")
        .and_then(|item| item.as_u64())
        .and_then(|count| u8::try_from(count).ok())
    {
        config.default_count = default_count;
    }
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
    if let Some(ui_language) = get_string_field(&value, "uiLanguage") {
        config.ui_language = ui_language;
    }
    if let Some(has_dismissed_welcome) = value
        .get("hasDismissedWelcome")
        .and_then(|item| item.as_bool())
    {
        config.has_dismissed_welcome = has_dismissed_welcome;
    }
    if let Some(batch_default_concurrency) = value
        .get("batchDefaultConcurrency")
        .and_then(|item| item.as_u64())
        .map(|item| item.clamp(1, 3) as u8)
    {
        config.batch_default_concurrency = batch_default_concurrency;
    }
    if let Some(batch_default_interval_seconds) = value
        .get("batchDefaultIntervalSeconds")
        .and_then(|item| item.as_u64())
        .map(|item| item.min(300))
    {
        config.batch_default_interval_seconds = batch_default_interval_seconds;
    }
    if let Some(batch_default_max_retries) = value
        .get("batchDefaultMaxRetries")
        .and_then(|item| item.as_u64())
        .map(|item| item.min(3) as u8)
    {
        config.batch_default_max_retries = batch_default_max_retries;
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

    config
}

fn read_api_key_fallback_value(value: &serde_json::Value) -> String {
    get_string_field(value, "apiKey").unwrap_or_default()
}

fn read_api_key_fallback(path: &Path) -> String {
    read_json_value(path)
        .map(|value| read_api_key_fallback_value(&value))
        .unwrap_or_default()
}

fn read_api_key_storage_mode(path: &Path) -> String {
    read_json_value(path)
        .and_then(|value| get_string_field(&value, API_KEY_STORAGE_FIELD))
        .unwrap_or_else(|| KEYRING_STORAGE_MODE.to_string())
}

pub fn load_api_key_with_result(path: &Path, keyring_result: Result<String, String>) -> String {
    let fallback_value = read_api_key_fallback(path);

    if read_api_key_storage_mode(path) == JSON_FALLBACK_STORAGE_MODE {
        return fallback_value;
    }

    match keyring_result {
        Ok(value) if !value.trim().is_empty() => value,
        _ => fallback_value,
    }
}

fn load_api_key(path: &Path) -> String {
    let keyring_result = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())
        .and_then(|entry| entry.get_password().map_err(|error| error.to_string()));

    load_api_key_with_result(path, keyring_result)
}

fn write_config_file(path: &Path, config: &AppConfig, api_key_storage_mode: &str) -> Result<(), String> {
    let mut value = serde_json::to_value(config).map_err(|error| error.to_string())?;
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

pub fn persist_api_key_json_fallback(path: &Path, api_key: &str) -> Result<(), String> {
    let current_config = read_json_value(path)
        .map(merge_config_value)
        .unwrap_or_else(default_config);
    let mut value = serde_json::to_value(current_config).map_err(|error| error.to_string())?;
    value["apiKey"] = serde_json::Value::String(api_key.to_string());
    value[API_KEY_STORAGE_FIELD] = serde_json::Value::String(JSON_FALLBACK_STORAGE_MODE.to_string());
    write_json(path, &value)
}

fn save_api_key(path: &Path, api_key: &str) -> Result<String, String> {
    let keyring_result = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())
        .map(|entry| {
            let write_result = entry
                .set_password(api_key)
                .map_err(|error| error.to_string());
            let read_back_result = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
                .map_err(|error| error.to_string())
                .and_then(|fresh_entry| fresh_entry.get_password().map_err(|error| error.to_string()));

            should_use_keyring_storage(write_result, read_back_result, api_key)
        });

    match keyring_result {
        Ok(true) => Ok(KEYRING_STORAGE_MODE.to_string()),
        Err(_) => {
            persist_api_key_json_fallback(path, api_key)?;
            Ok(JSON_FALLBACK_STORAGE_MODE.to_string())
        }
        Ok(false) => {
            persist_api_key_json_fallback(path, api_key)?;
            Ok(JSON_FALLBACK_STORAGE_MODE.to_string())
        }
    }
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

fn image_output_directory(input: &SaveGeneratedImageInput) -> Result<PathBuf, String> {
    let generated_at = parse_generated_at(&input.generated_at)?;
    let output_root = resolve_output_root(&input.config.output_directory, &output_base_dir()?);
    Ok(output_root.join(format_date_folder(generated_at)))
}

fn create_record(input: SaveGeneratedImageInput, output_path: &Path) -> ImageRecord {
    ImageRecord {
        id: unique_id(),
        status: "success".to_string(),
        created_at: input.generated_at,
        prompt: input.prompt,
        optimized_prompt: input.optimized_prompt,
        model: input.config.image_model,
        size: input.config.default_size,
        output_path: output_path.to_string_lossy().to_string(),
        duration_ms: input.duration_ms,
        error_message: None,
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
        Ok(raw) => Ok(parse_history_json(&raw)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("Failed to read history.json: {error}")),
    }
}

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let path = config_path()?;
    let mut config = load_config_from_path(&path)?;
    config.api_key = load_api_key(&path);
    Ok(config)
}

#[tauri::command]
pub fn save_config(mut config: AppConfig) -> Result<(), String> {
    let path = config_path()?;
    let api_key_storage_mode = save_api_key(&path, &config.api_key)?;

    if api_key_storage_mode == KEYRING_STORAGE_MODE {
        config.api_key.clear();
    }

    write_config_file(&path, &config, &api_key_storage_mode)
}

#[tauri::command]
pub fn load_history() -> Result<Vec<ImageRecord>, String> {
    let path = history_path()?;
    let mut history = load_history_for_display(&path)?;
    sort_history(&mut history);
    Ok(history)
}

#[tauri::command]
pub fn save_generated_image(input: SaveGeneratedImageInput) -> Result<SaveImageResult, String> {
    let _save_guard = SAVE_IMAGE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Save image lock was poisoned.".to_string())?;
    let directory = image_output_directory(&input)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let file_name = build_file_name(&input, &directory)?;
    let output_path = directory.join(file_name);
    let bytes = STANDARD
        .decode(input.image_base64.as_bytes())
        .map_err(|error| error.to_string())?;
    fs::write(&output_path, bytes).map_err(|error| error.to_string())?;

    let record = create_record(input, &output_path);
    let history_file = history_path()?;
    let mut history = load_history_for_save(&history_file)?;
    history.push(record.clone());
    sort_history(&mut history);
    write_json(&history_file, &history)?;

    Ok(SaveImageResult {
        preview_url: output_path.to_string_lossy().to_string(),
        record,
    })
}
