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
