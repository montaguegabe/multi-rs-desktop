//! Run blocking work (git, filesystem) off the async runtime so the webview
//! stays responsive. Panics surface as command errors.

pub async fn blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| format!("background task failed: {err}"))
}
