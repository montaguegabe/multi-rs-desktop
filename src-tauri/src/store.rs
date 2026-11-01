//! Per-user desktop state under `~/.multi` (override with `MULTI_HOME`):
//! the project list (`projects.json`) and app settings (`settings.json`).
//! File formats are shared with the Electron app so existing installs keep
//! their projects.

use std::path::PathBuf;

use multi_core::fsx;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

fn projects_file() -> PathBuf {
    fsx::multi_home_dir().join("projects.json")
}

fn settings_file() -> PathBuf {
    fsx::multi_home_dir().join("settings.json")
}

/// Configured project paths, in file order. Missing or unreadable → empty.
pub fn read_project_paths() -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(projects_file()) else {
        return Vec::new();
    };
    let Ok(Value::Array(entries)) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(|entry| entry.get("path").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

fn write_project_paths(paths: &[String]) -> Result<(), String> {
    let entries: Vec<Value> = paths.iter().map(|p| json!({ "path": p })).collect();
    let text = serde_json::to_string_pretty(&Value::Array(entries)).map_err(|e| e.to_string())?;
    fsx::write(&projects_file(), text).map_err(|e| e.to_string())
}

pub fn add_project(path: &str) -> Result<(), String> {
    let mut paths = read_project_paths();
    if paths.iter().any(|p| p == path) {
        return Ok(());
    }
    paths.push(path.to_string());
    write_project_paths(&paths)
}

pub fn remove_project(path: &str) -> Result<(), String> {
    if !projects_file().exists() {
        return Ok(());
    }
    let paths: Vec<String> = read_project_paths()
        .into_iter()
        .filter(|p| p != path)
        .collect();
    write_project_paths(&paths)
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "openAIApiKey"
    )]
    pub open_ai_api_key: Option<String>,
}

pub fn read_settings() -> AppSettings {
    std::fs::read_to_string(settings_file())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn write_settings(settings: &AppSettings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fsx::write(&settings_file(), text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config_path() -> String {
    projects_file().display().to_string()
}

#[tauri::command]
pub fn add_repo(repo_path: String) -> Result<(), String> {
    add_project(&repo_path)
}

#[tauri::command]
pub fn remove_repo(repo_path: String) -> Result<(), String> {
    remove_project(&repo_path)
}

#[tauri::command]
pub fn get_open_ai_api_key() -> String {
    read_settings().open_ai_api_key.unwrap_or_default()
}

#[tauri::command]
pub fn set_open_ai_api_key(api_key: String) -> Result<(), String> {
    let mut settings = read_settings();
    settings.open_ai_api_key = Some(api_key.trim().to_string());
    write_settings(&settings)
}
