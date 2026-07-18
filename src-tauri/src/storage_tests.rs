#[test]
fn sanitizes_cross_platform_file_names() {
    assert_eq!(
        crate::storage::sanitize_file_base_name("a<b>c:d/e\\f|g?h*i"),
        "a-b-c-d-e-f-g-h-i"
    );
}

#[test]
fn summarizes_prompt_with_eight_terms() {
    assert_eq!(
        crate::storage::summarize_prompt("one two three four five six seven eight nine ten"),
        "one-two-three-four-five-six-seven-eight"
    );
}

#[test]
fn resolves_relative_output_directories_under_app_data_base() {
    let base_dir = std::path::Path::new("C:/Users/test/AppData/Roaming/Chat To Image");
    let resolved = crate::storage::resolve_output_root("outputs", base_dir);

    assert_eq!(
        resolved,
        std::path::PathBuf::from("C:/Users/test/AppData/Roaming/Chat To Image/outputs")
    );
}

#[test]
fn merges_partial_config_with_defaults() {
    let merged = crate::storage::merge_config_value(serde_json::json!({
        "baseUrl": "https://example.com",
        "apiKey": "sk-local",
        "uiLanguage": "en-US",
        "hasDismissedWelcome": true
    }));

    assert_eq!(merged.base_url, "https://example.com");
    assert_eq!(merged.api_key, "sk-local");
    assert_eq!(merged.image_model, "gpt-image-2");
    assert_eq!(merged.output_directory, "outputs");
    assert_eq!(merged.ui_language, "en-US");
    assert!(merged.has_dismissed_welcome);
}

#[test]
fn migrates_old_config_to_the_complete_frontend_contract() {
    let merged = crate::storage::merge_config_value(serde_json::json!({
        "defaultCount": 4,
        "imageResponseMode": "provider-specific",
        "batchDefaultTaskCount": 99,
        "batchDefaultConcurrency": 99,
        "batchAutoPlanTaskCount": "yes"
    }));

    assert_eq!(merged.default_count, 1);
    assert_eq!(merged.image_response_mode, "official");
    assert!(!merged.remember_api_key);
    assert_eq!(merged.batch_default_task_count, 20);
    assert_eq!(merged.batch_default_concurrency, 10);
    assert!(merged.batch_auto_plan_task_count);
}

#[test]
fn config_file_round_trip_retains_image_response_and_batch_settings() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-config-round-trip-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");
    let config = crate::storage::merge_config_value(serde_json::json!({
        "rememberApiKey": true,
        "imageResponseMode": "force-base64",
        "batchDefaultTaskCount": 12,
        "batchDefaultConcurrency": 7,
        "batchDefaultIntervalSeconds": 45,
        "batchDefaultMaxRetries": 2,
        "batchAutoPlanTaskCount": false,
        "batchCustomSplitSystemPrompt": "Keep one visual system.",
        "batchLastSplitTemplateId": "series"
    }));

    std::fs::create_dir_all(&temp_root).unwrap();
    crate::storage::write_config_file(&config_path, &config, "keyring").unwrap();
    let loaded = crate::storage::load_config_from_path(&config_path).unwrap();

    assert!(loaded.remember_api_key);
    assert_eq!(loaded.image_response_mode, "force-base64");
    assert_eq!(loaded.default_count, 1);
    assert_eq!(loaded.batch_default_task_count, 12);
    assert_eq!(loaded.batch_default_concurrency, 7);
    assert_eq!(loaded.batch_default_interval_seconds, 45);
    assert_eq!(loaded.batch_default_max_retries, 2);
    assert!(!loaded.batch_auto_plan_task_count);
    assert_eq!(
        loaded.batch_custom_split_system_prompt,
        "Keep one visual system."
    );
    assert_eq!(loaded.batch_last_split_template_id, "series");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn config_file_round_trip_retains_provider_profiles_without_api_keys() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-provider-profile-round-trip-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");
    let mut config = crate::storage::default_config();
    config.provider_schema_version = 1;
    config.active_provider_profile_id = "provider-alt".to_string();
    config.provider_profiles = vec![crate::models::ProviderProfileMetadata {
        id: "provider-alt".to_string(),
        name: "Alternate provider".to_string(),
        base_url: "https://alternate.example/v1".to_string(),
        text_model: "text-alt".to_string(),
        image_model: "image-alt".to_string(),
        image_response_mode: "force-base64".to_string(),
        remember_api_key: true,
    }];
    config.api_key = "runtime-only-key".to_string();

    std::fs::create_dir_all(&temp_root).unwrap();
    crate::storage::write_config_file(&config_path, &config, "keyring").unwrap();
    let raw = std::fs::read_to_string(&config_path).unwrap();
    assert!(raw.contains("providerSchemaVersion"));
    assert!(raw.contains("provider-alt"));
    let stored: serde_json::Value = serde_json::from_str(&raw).unwrap();
    assert!(stored.get("apiKey").is_none());
    assert!(!raw.contains("runtime-only-key"));

    let loaded = crate::storage::load_config_from_path(&config_path).unwrap();
    assert_eq!(loaded.active_provider_profile_id, "provider-alt");
    assert_eq!(loaded.provider_profiles[0].image_model, "image-alt");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn default_config_uses_chinese_ui_and_shows_welcome_once() {
    let defaults = crate::storage::default_config();

    assert_eq!(defaults.ui_language, "zh-CN");
    assert!(!defaults.has_dismissed_welcome);
}

#[test]
fn default_config_includes_batch_defaults() {
    let defaults = crate::storage::default_config();

    assert_eq!(defaults.batch_default_concurrency, 1);
    assert_eq!(defaults.batch_default_interval_seconds, 20);
    assert_eq!(defaults.batch_default_max_retries, 1);
    assert_eq!(defaults.batch_custom_split_system_prompt, "");
    assert_eq!(defaults.batch_last_split_template_id, "basic");
    assert_eq!(defaults.batch_default_task_count, 5);
    assert!(defaults.batch_auto_plan_task_count);
    assert_eq!(defaults.image_response_mode, "official");
    assert!(!defaults.remember_api_key);
}

#[test]
fn batch_directory_names_include_timestamp_and_title() {
    use chrono::TimeZone;

    let created_at = chrono::Local
        .with_ymd_and_hms(2026, 5, 17, 12, 30, 12)
        .single()
        .unwrap()
        .to_rfc3339();
    let name = crate::storage::batch_directory_name(&created_at, "World Cup Posters")
    .unwrap();

    assert!(name.contains("2026-05-17-123012-batch-world-cup-posters"));
}

#[test]
fn merges_and_clamps_batch_config() {
    let merged = crate::storage::merge_config_value(serde_json::json!({
        "batchDefaultConcurrency": 9,
        "batchDefaultIntervalSeconds": 999,
        "batchDefaultMaxRetries": 8,
        "batchCustomSplitSystemPrompt": "Split consistently.",
        "batchLastSplitTemplateId": "series"
    }));

    assert_eq!(merged.batch_default_concurrency, 9);
    assert_eq!(merged.batch_default_interval_seconds, 300);
    assert_eq!(merged.batch_default_max_retries, 3);
    assert_eq!(merged.batch_custom_split_system_prompt, "Split consistently.");
    assert_eq!(merged.batch_last_split_template_id, "series");
}

#[test]
fn invalid_history_json_falls_back_to_empty_list() {
    let history = crate::storage::parse_history_json("not-json");
    assert!(history.is_empty());
}

#[test]
fn missing_config_file_defaults_but_invalid_config_json_errors() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-config-test-{}",
        std::process::id()
    ));
    let missing_path = temp_root.join("missing-config.json");
    let invalid_path = temp_root.join("invalid-config.json");

    let loaded_missing = crate::storage::load_config_from_path(&missing_path).unwrap();
    assert_eq!(loaded_missing.base_url, crate::storage::default_config().base_url);

    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(&invalid_path, "{ invalid json").unwrap();
    let invalid_error = crate::storage::load_config_from_path(&invalid_path).unwrap_err();

    assert!(invalid_error.contains("config"));

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn valid_but_wrong_shape_config_json_errors() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-config-shape-test-{}",
        std::process::id()
    ));
    let wrong_shape_path = temp_root.join("wrong-shape-config.json");

    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(&wrong_shape_path, "[]").unwrap();

    let error = crate::storage::load_config_from_path(&wrong_shape_path).unwrap_err();

    assert!(error.contains("config"));

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn history_for_save_rejects_malformed_json_and_io_errors() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-history-test-{}",
        std::process::id()
    ));
    let invalid_path = temp_root.join("invalid-history.json");
    let directory_path = temp_root.join("history-dir");
    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(&invalid_path, "{ invalid json").unwrap();
    std::fs::create_dir_all(&directory_path).unwrap();

    let io_error = crate::storage::load_history_for_save(&directory_path).unwrap_err();
    assert!(io_error.contains("history.json"));

    let invalid_error = crate::storage::load_history_for_save(&invalid_path).unwrap_err();
    assert!(invalid_error.contains("Failed to parse history.json"));
    assert_eq!(std::fs::read_to_string(&invalid_path).unwrap(), "{ invalid json");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn keeps_keyring_storage_only_when_read_back_succeeds() {
    assert!(crate::storage::should_use_keyring_storage(
        Ok(()),
        Ok("sk-local".to_string()),
        "sk-local"
    ));
}

#[test]
fn falls_back_when_keyring_cannot_read_saved_value() {
    assert!(!crate::storage::should_use_keyring_storage(
        Ok(()),
        Err("backend unavailable".to_string()),
        "sk-local"
    ));
}

#[test]
fn falls_back_when_keyring_reads_a_different_value() {
    assert!(!crate::storage::should_use_keyring_storage(
        Ok(()),
        Ok("different".to_string()),
        "sk-local"
    ));
}

#[test]
fn falls_back_when_write_fails_even_if_stale_key_matches() {
    assert!(!crate::storage::should_use_keyring_storage(
        Err("write failed".to_string()),
        Ok("sk-local".to_string()),
        "sk-local"
    ));
}

#[test]
fn persists_api_key_in_json_fallback_mode() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-api-key-fallback-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");

    std::fs::create_dir_all(&temp_root).unwrap();
    crate::storage::persist_api_key_json_fallback(&config_path, "provider-default", "sk-local").unwrap();

    let stored: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&config_path).unwrap()).unwrap();
    assert_eq!(stored["__apiKeyStorage"], "json-fallback");
    assert_eq!(stored["__apiKeys"]["provider-default"], "sk-local");
    assert!(stored.get("apiKey").is_none());

    let loaded = crate::storage::load_config_from_path(&config_path).unwrap();
    assert_eq!(loaded.api_key, "");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn loads_api_key_from_json_fallback_mode() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-api-key-load-fallback-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");

    std::fs::create_dir_all(&temp_root).unwrap();
    crate::storage::persist_api_key_json_fallback(&config_path, "provider-default", "sk-local").unwrap();

    let loaded =
        crate::storage::load_api_key_with_result(&config_path, "provider-default", Ok("wrong-keyring".to_string()), Err("missing".to_string()));
    assert_eq!(loaded, "sk-local");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn json_fallback_keys_are_isolated_by_provider_profile() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-api-key-profile-isolation-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");

    std::fs::create_dir_all(&temp_root).unwrap();
    crate::storage::persist_api_key_json_fallback(&config_path, "provider-a", "key-a").unwrap();
    crate::storage::persist_api_key_json_fallback(&config_path, "provider-b", "key-b").unwrap();

    assert_eq!(crate::storage::load_api_key_with_result(&config_path, "provider-a", Err("missing".to_string()), Err("missing".to_string())), "key-a");
    assert_eq!(crate::storage::load_api_key_with_result(&config_path, "provider-b", Err("missing".to_string()), Err("missing".to_string())), "key-b");

    let raw = std::fs::read_to_string(&config_path).unwrap();
    let stored: serde_json::Value = serde_json::from_str(&raw).unwrap();
    assert!(stored.get("apiKey").is_none());
    assert_eq!(stored["__apiKeys"]["provider-a"], "key-a");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn keyring_results_are_isolated_by_provider_profile() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-keyring-profile-isolation-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");

    std::fs::create_dir_all(&temp_root).unwrap();
    assert_eq!(
        crate::storage::load_api_key_with_result(
            &config_path,
            "provider-a",
            Ok("key-a".to_string()),
            Err("missing".to_string())
        ),
        "key-a"
    );
    assert_eq!(
        crate::storage::load_api_key_with_result(
            &config_path,
            "provider-b",
            Ok("key-b".to_string()),
            Err("missing".to_string())
        ),
        "key-b"
    );

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn migrates_legacy_single_json_key_to_active_profile() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-api-key-profile-migration-test-{}",
        std::process::id()
    ));
    let config_path = temp_root.join("config.json");

    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(&config_path, serde_json::to_string(&serde_json::json!({
        "activeProviderProfileId": "provider-alt",
        "providerProfiles": [
            {"id": "provider-default", "name": "Default", "baseUrl": "https://one", "textModel": "text-one", "imageModel": "image-one", "imageResponseMode": "official", "rememberApiKey": false},
            {"id": "provider-alt", "name": "Alternate", "baseUrl": "https://two", "textModel": "text-two", "imageModel": "image-two", "imageResponseMode": "force-base64", "rememberApiKey": true}
        ],
        "apiKey": "legacy-key",
        "__apiKeyStorage": "json-fallback"
    })).unwrap()).unwrap();

    assert_eq!(crate::storage::load_api_key_with_result(&config_path, "provider-alt", Err("missing".to_string()), Err("missing".to_string())), "legacy-key");
    let stored: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&config_path).unwrap()).unwrap();
    assert_eq!(stored["__apiKeys"]["provider-alt"], "legacy-key");
    assert!(stored.get("apiKey").is_none());

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn save_rolls_back_new_image_when_history_is_malformed() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-save-rollback-test-{}",
        std::process::id()
    ));
    let history_path = temp_root.join("history.json");
    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(&history_path, "{ invalid json").unwrap();
    let mut config = crate::storage::default_config();
    config.output_directory = "outputs".to_string();
    let input = crate::models::SaveGeneratedImageInput {
        image_base64: "aGVsbG8=".to_string(),
        prompt: "Rollback test".to_string(),
        optimized_prompt: String::new(),
        custom_name: "rollback-test".to_string(),
        config,
        generated_at: "2026-07-12T10:30:00+00:00".to_string(),
        duration_ms: 100,
        provider_profile_snapshot: None,
    };

    let error = crate::storage::save_generated_image_at(input, &temp_root, &history_path).unwrap_err();

    assert!(error.contains("History commit failed after image write"));
    assert!(error.contains("saved image was removed"));
    assert_eq!(std::fs::read_to_string(&history_path).unwrap(), "{ invalid json");
    assert!(!temp_root.join("outputs/2026-07-12/rollback-test.png").exists());

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn rollback_failure_is_reported_explicitly() {
    let error = crate::storage::format_history_commit_failure(
        "history write denied".to_string(),
        Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "rollback denied")),
    );

    assert!(error.contains("History commit failed after image write"));
    assert!(error.contains("image rollback also failed"));
    assert!(error.contains("rollback denied"));
}

#[test]
fn output_directory_test_writes_and_reads_a_real_marker() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-output-directory-test-{}",
        std::process::id()
    ));

    let result = crate::storage::test_output_directory_at(&temp_root).unwrap();

    assert!(result.bytes > 0);
    assert!(result.last_tested_at.contains('T'));
    let state_path = temp_root.join(".chat-to-image-output-directory-test");
    assert_eq!(
        std::fs::read_to_string(&state_path).unwrap(),
        format!("chat-to-image-output-directory-test\n{}\n", result.last_tested_at)
    );
    assert_eq!(
        crate::storage::read_output_directory_test_at(&temp_root).unwrap(),
        Some(result.last_tested_at.clone())
    );
    let remaining_files = std::fs::read_dir(&temp_root)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert_eq!(remaining_files, vec![".chat-to-image-output-directory-test"]);

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn output_directory_state_is_not_ready_without_a_valid_marker() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-output-directory-state-test-{}",
        std::process::id()
    ));
    std::fs::create_dir_all(&temp_root).unwrap();

    assert_eq!(crate::storage::read_output_directory_test_at(&temp_root).unwrap(), None);

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn output_directory_state_rejects_non_regular_state_paths() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-output-directory-non-regular-test-{}",
        std::process::id()
    ));
    let state_path = temp_root.join(".chat-to-image-output-directory-test");
    std::fs::create_dir_all(&state_path).unwrap();

    let error = crate::storage::read_output_directory_test_at(&temp_root).unwrap_err();

    assert!(error.contains("regular file"));

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn output_directory_test_overwrites_existing_state_file_without_leaving_probe_files() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-output-directory-overwrite-test-{}",
        std::process::id()
    ));
    let state_path = temp_root.join(".chat-to-image-output-directory-test");
    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(
        &state_path,
        "chat-to-image-output-directory-test\n2026-01-01T00:00:00+00:00\n",
    )
    .unwrap();

    let result = crate::storage::test_output_directory_at(&temp_root).unwrap();

    assert_eq!(
        crate::storage::read_output_directory_test_at(&temp_root).unwrap(),
        Some(result.last_tested_at.clone())
    );
    let remaining_files = std::fs::read_dir(&temp_root)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert_eq!(remaining_files, vec![".chat-to-image-output-directory-test"]);

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn output_directory_test_preserves_an_unknown_existing_marker_file() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-output-directory-unknown-marker-test-{}",
        std::process::id()
    ));
    let state_path = temp_root.join(".chat-to-image-output-directory-test");
    std::fs::create_dir_all(&temp_root).unwrap();
    std::fs::write(&state_path, "user-owned contents").unwrap();

    let error = crate::storage::test_output_directory_at(&temp_root).unwrap_err();

    assert!(error.contains("not an app-owned marker"));
    assert_eq!(std::fs::read_to_string(&state_path).unwrap(), "user-owned contents");

    let _ = std::fs::remove_dir_all(&temp_root);
}

#[test]
fn output_directory_test_allows_concurrent_runs_without_colliding() {
    let temp_root = std::env::temp_dir().join(format!(
        "chat-to-image-output-directory-concurrency-test-{}",
        std::process::id()
    ));
    std::fs::create_dir_all(&temp_root).unwrap();

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(24));
    let handles = (0..24)
        .map(|_| {
            let path = temp_root.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                crate::storage::test_output_directory_at(&path).unwrap()
            })
        })
        .collect::<Vec<_>>();
    let results = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect::<Vec<_>>();

    assert_eq!(results.len(), 24);
    assert!(results.iter().all(|result| result.bytes > 0));
    let restored = crate::storage::read_output_directory_test_at(&temp_root)
        .unwrap()
        .expect("missing restored timestamp");
    assert!(results
        .iter()
        .any(|result| result.last_tested_at == restored));
    let remaining_files = std::fs::read_dir(&temp_root)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert_eq!(remaining_files, vec![".chat-to-image-output-directory-test"]);

    let _ = std::fs::remove_dir_all(&temp_root);
}
