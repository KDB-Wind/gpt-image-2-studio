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
        "apiKey": "sk-local"
    }));

    assert_eq!(merged.base_url, "https://example.com");
    assert_eq!(merged.api_key, "sk-local");
    assert_eq!(merged.image_model, "gpt-image-2");
    assert_eq!(merged.output_directory, "outputs");
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
fn history_for_save_keeps_parse_fallback_but_returns_io_errors() {
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

    let invalid_history = crate::storage::load_history_for_save(&invalid_path).unwrap();
    assert!(invalid_history.is_empty());

    let _ = std::fs::remove_dir_all(&temp_root);
}
