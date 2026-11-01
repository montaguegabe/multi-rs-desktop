//! Commit message generation through the OpenAI chat completions API, using
//! the key stored in the desktop settings.

use serde_json::{Value, json};

use crate::store::read_settings;

const MAX_DIFF_CHARS: usize = 18_000;

#[tauri::command]
pub async fn generate_commit_message(diff: String) -> Result<String, String> {
    let trimmed = diff.trim();
    if trimmed.is_empty() {
        return Err("No selected changes to summarize.".into());
    }
    let api_key = read_settings()
        .open_ai_api_key
        .unwrap_or_default()
        .trim()
        .to_string();
    if api_key.is_empty() {
        return Err("OpenAI API key not set. Add it in Settings.".into());
    }

    let diff_for_model = if trimmed.chars().count() > MAX_DIFF_CHARS {
        let head: String = trimmed.chars().take(MAX_DIFF_CHARS).collect();
        format!("{head}\n\n[Diff truncated for size]")
    } else {
        trimmed.to_string()
    };

    let body = json!({
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "max_tokens": 120,
        "messages": [
            {
                "role": "system",
                "content": "You write concise git commit messages. Return only one line, imperative mood, no trailing period, max 72 chars."
            },
            {
                "role": "user",
                "content": format!("Write a commit message for this diff:\n\n{diff_for_model}")
            }
        ]
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        let concise: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
        let concise: String = concise.chars().take(240).collect();
        return Err(format!("OpenAI error ({}): {concise}", status.as_u16()));
    }

    let data: Value = response
        .json()
        .await
        .map_err(|e| format!("OpenAI returned invalid JSON: {e}"))?;
    let raw = data
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let first_line = raw
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .ok_or_else(|| "OpenAI returned an empty commit message.".to_string())?;
    Ok(first_line.chars().take(120).collect())
}
