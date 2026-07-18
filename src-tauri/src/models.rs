use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub base_url: String,
    pub api_key: String,
    pub remember_api_key: bool,
    pub text_model: String,
    pub image_model: String,
    pub timeout_seconds: u64,
    pub output_directory: String,
    pub default_size: String,
    pub default_count: u8,
    pub default_quality: String,
    pub default_format: String,
    pub default_compression: u8,
    pub image_response_mode: String,
    pub ui_language: String,
    pub has_dismissed_welcome: bool,
    pub batch_default_task_count: u8,
    pub batch_default_concurrency: u8,
    pub batch_default_interval_seconds: u64,
    pub batch_default_max_retries: u8,
    pub batch_auto_plan_task_count: bool,
    pub batch_custom_split_system_prompt: String,
    pub batch_last_split_template_id: String,
    pub provider_schema_version: u8,
    pub active_provider_profile_id: String,
    pub provider_profiles: Vec<ProviderProfileMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProfileMetadata {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub text_model: String,
    pub image_model: String,
    pub image_response_mode: String,
    pub remember_api_key: bool,
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
    pub provider_profile_snapshot: Option<ProviderProfileSnapshot>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProfileSnapshot {
    pub provider_profile_id: String,
    pub provider_profile_name: String,
    pub image_model: String,
    pub image_response_mode: String,
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
    pub provider_profile_snapshot: Option<ProviderProfileSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBatchImageTaskInput {
    pub id: String,
    pub index: usize,
    pub title: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBatchImageInput {
    pub batch_id: String,
    pub batch_title: String,
    pub batch_created_at: String,
    pub task: SaveBatchImageTaskInput,
    pub image_base64: String,
    pub config: AppConfig,
    pub generated_at: String,
    pub duration_ms: u64,
    pub provider_profile_snapshot: Option<ProviderProfileSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageResult {
    pub record: ImageRecord,
    pub preview_url: String,
    pub save_mode: String,
    pub history_durability: String,
    pub history_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDirectoryTestResult {
    pub ok: bool,
    pub file_name: Option<String>,
    pub bytes: Option<u64>,
    pub last_tested_at: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDirectoryStateResult {
    pub status: String,
    pub name: Option<String>,
    pub last_tested_at: Option<String>,
}
