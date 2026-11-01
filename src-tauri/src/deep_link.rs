//! `multi://open?path=<percent-encoded absolute path>` handling. The `multi
//! open PATH` CLI command launches these URLs; a directory opens as a project
//! and a file opens its repository with the file prioritized.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime};
use url::Url;

use crate::projects::{NavigationTarget, resolve_navigation_target};
use crate::window::show_main_window;

/// Navigation requested before the renderer subscribed to events.
#[derive(Default)]
pub struct PendingNavigation(Mutex<Option<NavigationTarget>>);

pub fn target_from_url(url: &str) -> Option<NavigationTarget> {
    let parsed = Url::parse(url).ok()?;
    if parsed.scheme() != "multi" {
        return None;
    }
    let is_open = parsed.host_str() == Some("open") || parsed.path() == "//open";
    if !is_open {
        return None;
    }
    let (_, path) = parsed.query_pairs().find(|(key, _)| key == "path")?;
    if path.is_empty() {
        return None;
    }
    resolve_navigation_target(&PathBuf::from(path.as_ref()))
}

/// Navigate the renderer to a repository, remembering the request until the
/// renderer asks for it when the window is still loading.
pub fn navigate_to_repo<R: Runtime>(app: &AppHandle<R>, target: NavigationTarget) {
    if let Ok(mut pending) = app.state::<PendingNavigation>().0.lock() {
        *pending = Some(target.clone());
    }
    if let Some(window) = show_main_window(app) {
        let _ = window.emit("navigate-to-repo", &target);
    }
}

pub fn handle_urls<R: Runtime>(app: &AppHandle<R>, urls: &[Url]) {
    for url in urls {
        if let Some(target) = target_from_url(url.as_str()) {
            navigate_to_repo(app, target);
        } else {
            log::warn!("ignoring deep link {url}");
        }
    }
}

/// Renderer handshake: the navigation requested before it was listening.
#[tauri::command]
pub fn take_pending_navigation(app: AppHandle) -> Option<NavigationTarget> {
    app.state::<PendingNavigation>()
        .0
        .lock()
        .ok()
        .and_then(|mut pending| pending.take())
}

#[cfg(test)]
mod tests {
    use super::target_from_url;

    #[test]
    fn rejects_other_schemes_and_hosts() {
        assert!(target_from_url("https://open?path=%2Ftmp").is_none());
        assert!(target_from_url("multi://other?path=%2Ftmp").is_none());
        assert!(target_from_url("multi://open").is_none());
    }

    #[test]
    fn resolves_an_existing_directory() {
        let dir = tempfile::tempdir().unwrap();
        let encoded = percent_encoding::utf8_percent_encode(
            dir.path().to_str().unwrap(),
            percent_encoding::NON_ALPHANUMERIC,
        );
        let target = target_from_url(&format!("multi://open?path={encoded}")).unwrap();
        assert_eq!(
            target.repo_path,
            std::fs::canonicalize(dir.path())
                .unwrap()
                .display()
                .to_string()
        );
        assert!(target.file_path.is_none());
    }
}
