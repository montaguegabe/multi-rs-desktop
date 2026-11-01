//! Main window lifecycle: creation from config, show/focus, and the macOS
//! convention of staying alive with no windows until the dock icon is clicked.

use tauri::{AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_WINDOW: &str = "main";

/// The main window, created from `tauri.conf.json` when it was closed.
pub fn ensure_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        return Some(window);
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN_WINDOW)
        .cloned()?;
    match WebviewWindowBuilder::from_config(app, &config).and_then(|b| b.build()) {
        Ok(window) => Some(window),
        Err(err) => {
            log::error!("failed to recreate main window: {err}");
            None
        }
    }
}

/// Bring the main window to the front, restoring it when minimized.
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let window = ensure_main_window(app)?;
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}
