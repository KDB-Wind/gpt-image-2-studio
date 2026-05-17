use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub base_url: String,
    pub api_key: String,
    pub text_model: String,
    pub image_model: String,
    pub timeout_seconds: u64,
    pub output_directory: String,
    pub default_size: String,
    pub default_count: u8,
    pub default_quality: String,
    pub default_format: String,
    pub default_compression: u8,
    pub ui_language: String,
    pub has_dismissed_welcome: bool,
    pub batch_default_concurrency: u8,
    pub batch_default_interval_seconds: u64,
    pub batch_default_max_retries: u8,
    pub batch_custom_split_system_prompt: String,
    pub batch_last_split_template_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRecord {
    pub id: String,
    pub status: String,
    pub created_at: String,
    pub prompt: String,
    pub optimized_prompt: String,
    pub model: String,
    pub size: String,
    pub output_path: String,
    pub duration_ms: u64,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGeneratedImageInput {
    pub image_base64: String,
    pub prompt: String,
    pub optimized_prompt: String,
    pub custom_name: String,
    pub config: AppConfig,
    pub generated_at: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageResult {
    pub record: ImageRecord,
    pub preview_url: String,
}
