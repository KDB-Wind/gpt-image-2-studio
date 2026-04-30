use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Local};
use directories::ProjectDirs;
use keyring::Entry;
use serde::{de::DeserializeOwned, Serialize};

use crate::models::{AppConfig, ImageRecord, SaveGeneratedImageInput, SaveImageResult};

const KEYRING_SERVICE: &str = "chat-to-image";
const KEYRING_ACCOUNT: &str = "default";
const RESERVED_WINDOWS_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7",
    "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

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

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    ensure_parent(path)?;
    let json = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, json).map_err(|error| error.to_string())
}

fn read_api_key_fallback(path: &Path) -> String {
    read_json::<serde_json::Value>(path)
        .ok()
        .flatten()
        .and_then(|value| value.get("apiKey").and_then(|item| item.as_str()).map(ToOwned::to_owned))
        .unwrap_or_default()
}

fn load_api_key(path: &Path) -> String {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())
        .and_then(|entry| entry.get_password().map_err(|error| error.to_string()))
        .unwrap_or_else(|_| read_api_key_fallback(path))
}

fn save_api_key(path: &Path, api_key: &str) -> Result<bool, String> {
    let keyring_result = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())
        .and_then(|entry| entry.set_password(api_key).map_err(|error| error.to_string()));

    match keyring_result {
        Ok(()) => Ok(true),
        Err(_) => {
            let mut value = serde_json::to_value(read_json::<AppConfig>(path)?.unwrap_or_else(default_config))
                .map_err(|error| error.to_string())?;
            value["apiKey"] = serde_json::Value::String(api_key.to_string());
            write_json(path, &value)?;
            Ok(false)
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

fn image_output_directory(input: &SaveGeneratedImageInput) -> Result<PathBuf, String> {
    let generated_at = parse_generated_at(&input.generated_at)?;
    let output_root = PathBuf::from(normalize_output_directory(&input.config.output_directory));
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

#[tauri::command]
pub fn load_config() -> Result<AppConfig, String> {
    let path = config_path()?;
    let mut config = read_json::<AppConfig>(&path)?.unwrap_or_else(default_config);
    config.api_key = load_api_key(&path);
    Ok(config)
}

#[tauri::command]
pub fn save_config(mut config: AppConfig) -> Result<(), String> {
    let path = config_path()?;
    let stored_in_keyring = save_api_key(&path, &config.api_key)?;

    if stored_in_keyring {
        config.api_key.clear();
    }

    write_json(&path, &config)
}

#[tauri::command]
pub fn load_history() -> Result<Vec<ImageRecord>, String> {
    let path = history_path()?;
    let mut history = read_json::<Vec<ImageRecord>>(&path)?.unwrap_or_default();
    sort_history(&mut history);
    Ok(history)
}

#[tauri::command]
pub fn save_generated_image(input: SaveGeneratedImageInput) -> Result<SaveImageResult, String> {
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
    let mut history = read_json::<Vec<ImageRecord>>(&history_file)?.unwrap_or_default();
    history.push(record.clone());
    sort_history(&mut history);
    write_json(&history_file, &history)?;

    Ok(SaveImageResult {
        preview_url: output_path.to_string_lossy().to_string(),
        record,
    })
}
