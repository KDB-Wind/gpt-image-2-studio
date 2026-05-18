# Chat To Image Design

Date: 2026-04-30

## Goal

Build a lightweight local image generation application that can be used by the project owner and later shared with other users. The application calls an OpenAI-compatible text model for optional prompt optimization and an image model for image generation. It stores each user's API configuration locally, keeps the API key out of the distributed project defaults, and saves generated images to local folders with stable date-based organization.

The first version should prioritize a clean, practical tool experience over a marketing-style interface.

## Confirmed Requirements

- Use a shared UI that supports both a web mode and a desktop mode.
- Use Tauri + Vite for the main implementation path.
- Desktop mode is the primary complete experience.
- Web mode is a lightweight compatibility experience.
- Default base URL: `https://ruoli.dev/v1`.
- Default text model: `gpt-5.4-mini`.
- Default image model: `gpt-image-2`.
- Default API key is empty. Users enter and save their own key locally.
- Users can edit and save the base URL, API key, text model, image model, timeout, and output directory.
- Users can test the text model and image model before saving configuration.
- Test failures do not block saving. The UI shows a warning and allows the user to keep the configuration.
- Prompt optimization is off by default. Users manually choose when to optimize a prompt.
- Image generation requests are expected to take about 120-130 seconds.
- Default request timeout is at least 180 seconds.
- Users can increase the timeout in settings.
- Generated images are saved locally.
- Default image organization is `outputs/YYYY-MM-DD/`.
- Default filenames use the generation time and a prompt summary, for example `21-15-08_sunset-city.png`.
- Each generation can include an optional custom image name.
- If the custom name is empty, use the default naming rule.
- If the custom name is provided, sanitize it, add the image extension, and avoid collisions by appending a numeric suffix.
- Users can choose and persist a default output directory.
- Do not implement a complex custom filename template system in the first version.

## Architecture

The application is split into three layers:

- Frontend: a Vite UI for settings, prompt input, generation controls, result preview, task state, and history.
- Core: shared TypeScript logic for validation, request construction, timeout handling, filename generation, history metadata, and UI state coordination.
- Runtime adapter: a narrow abstraction for capabilities that differ between web and desktop.

The runtime adapter has two implementations:

- Web adapter: stores configuration in browser storage, saves images through the File System Access API when available, and falls back to browser downloads.
- Tauri adapter: stores configuration in the user's local app data area, saves images directly to the configured directory, opens output folders, and can use secure storage for API keys when available.

This keeps most behavior shared while isolating platform-specific file and configuration work.

## Runtime Modes

Desktop mode is the primary distribution target.

Desktop mode supports:

- Local configuration persistence.
- Automatic output directory creation.
- Automatic image saving into date folders.
- Opening the output directory from the app.
- More reliable long-running requests.
- Access to app-local or system-local secure storage options.

Web mode supports:

- Configuration stored in browser local storage or IndexedDB.
- User-selected save directory when the browser supports it.
- Download fallback when direct folder writes are unavailable.
- The same generation workflow and history UI where browser permissions allow it.

The two modes do not need identical file-system capabilities. They should present the same concepts and degrade clearly in web mode.

## UI Structure

The first screen is the generation workspace.

Main regions:

- Left panel: prompt input, optional image name, prompt optimization controls, model parameters, and generate button.
- Center panel: active task state, elapsed time, result preview, error state, retry controls, and save status.
- Right panel: history list grouped by date, sorted newest first.
- Top bar: settings entry, output directory action, and runtime mode indicator.

Settings view:

- Base URL.
- API key.
- Text model.
- Image model.
- Timeout in seconds.
- Default output directory.
- Text model test action.
- Image model test action.
- Save action.
- Last test result and warning state.

History view:

- Date-grouped images.
- Thumbnail preview.
- Original prompt.
- Optimized prompt when present.
- Model name.
- Output path.
- Generation time and duration.
- Error details for failed tasks.
- Reuse prompt and retry actions.

## Visual Direction

The UI should feel like a reliable local creative tool:

- Clean, restrained, and easy to scan.
- No landing page.
- No decorative hero section.
- Result image preview is the visual focus.
- Controls are compact but not crowded.
- Status messages are explicit and calm.
- The layout adapts from a three-column desktop workspace to a tabbed or stacked narrow layout.

The app should avoid a one-color visual scheme. Use a restrained neutral base with a small set of functional accent colors for active, success, warning, and error states.

## Configuration And Security

Configuration is split into non-sensitive and sensitive values.

Non-sensitive values:

- Base URL.
- Text model.
- Image model.
- Timeout.
- Default output directory.
- Last-used generation parameters.
- UI preferences.

Sensitive value:

- API key.

Desktop mode stores configuration in the user's app data directory. The API key should use a secure storage option when practical. If secure storage is unavailable, the app may fall back to local app configuration storage and clearly indicate that the key is stored only on the user's machine.

Web mode stores configuration in browser storage. The API key is never written into project files and is not included in defaults.

The repository should not contain a real API key. Documentation should instruct users to enter their own key in the app settings.

## API Behavior

The request layer should be compatible with OpenAI-style endpoints and configurable base URLs.

Base URL handling:

- Accept values with or without `/v1`.
- Normalize internally so endpoint construction is consistent.
- Do not hard-code `ruoli.dev` outside defaults.

Text model test:

- Sends a minimal text request using the configured text model.
- Confirms that base URL, API key, and model name can produce a response.

Image model test:

- Uses the lowest-cost viable image request if the API supports it.
- If no true lightweight test exists, warn that this may trigger a real image generation request.

Generation:

1. Validate required fields.
2. Use the current prompt directly unless the user manually optimizes it first.
3. Optional optimization calls the configured text model and returns an editable prompt.
4. Image generation calls the configured image model.
5. Apply the configured timeout, defaulting to 180 seconds.
6. Show elapsed time while the request is running.
7. Allow cancellation where the runtime supports it.
8. Parse image responses that return base64 data or image URLs.
9. Save the image locally.
10. Write or update history metadata.
11. Show the generated image and file location.

Errors should preserve the user's input and parameters so the user can retry without rebuilding the request.

## File Storage

Default output structure:

```text
outputs/
  2026-04-30/
    21-15-08_sunset-city.png
    21-20-31_custom-name.png
```

Filename rules:

- If the user supplies a name, use it as the base filename.
- If the user leaves the name empty, use `HH-mm-ss_prompt-summary`.
- Sanitize forbidden characters across Windows, macOS, and Linux.
- Trim excessive whitespace.
- Keep filenames reasonably short.
- Preserve or append the image extension.
- If a file already exists, append `-2`, `-3`, and so on.

History metadata should be stored separately from the image files. The first version will use JSON metadata files.

## Testing Scope

The implementation should include focused tests for:

- Base URL normalization.
- Configuration validation.
- Timeout validation.
- Filename sanitization and collision handling.
- Date-based output path creation.
- Response parsing for base64 and URL-style image outputs.
- History metadata writing and reading.

Manual verification should cover:

- Web mode configuration save and reload.
- Desktop mode configuration save and reload.
- Text model connection test behavior.
- Image model connection test warning behavior.
- Successful generation with a long timeout.
- Failed generation retry.
- Custom filename behavior.
- Default filename behavior.
- Output directory selection.

## Implementation Decisions

- Use the current stable Tauri + Vite project template at implementation time.
- Keep Tauri plugins behind the runtime adapter so plugin changes do not affect UI code.
- Store first-version history metadata in JSON files. Move to a small embedded database only if JSON becomes a real limitation.
- Implement an OpenAI-compatible request module with isolated request builders for text, prompt optimization, image testing, and image generation.
- Support both base64 image data and URL image responses in the response parser.
- Treat provider-specific image payload differences as request-module concerns, not UI concerns.
- Build packaging scripts for Windows and macOS through Tauri's standard bundle flow after the app runs locally.
