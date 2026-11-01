//! Application menu and native context menus.
//!
//! Context menus pop up natively and resolve to the clicked item id (or
//! `None` when dismissed), matching the renderer's `showNativeContextMenu`
//! contract. On macOS and Windows `popup_menu` blocks until the menu closes,
//! so its return doubles as the dismissal signal. GTK returns immediately, so
//! on Linux a menu resolves only through a click, through being replaced by
//! the next menu, or through the overall timeout.

use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{RecvTimeoutError, Sender, channel};
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

use crate::tasks::blocking;
use crate::window::show_main_window;

pub const SETTINGS_MENU_ID: &str = "settings";
const CONTEXT_PREFIX: &str = "ctx:";
/// Upper bound on how long a popup may stay open without resolving.
const CONTEXT_MENU_TIMEOUT: Duration = Duration::from_secs(120);
/// The click event is delivered through the runtime's event loop and may land
/// slightly after a blocking popup returns.
const CLICK_GRACE: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeContextMenuItem {
    pub id: Option<String>,
    pub label: Option<String>,
    pub enabled: Option<bool>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

enum ContextMenuMessage {
    Selected(Option<String>),
    Closed,
}

struct PendingContextMenu {
    /// Distinguishes this popup from one that replaced it.
    generation: u64,
    ids: Vec<Option<String>>,
    sender: Sender<ContextMenuMessage>,
}

/// The context menu currently shown, if any, plus a counter for telling
/// successive popups apart.
#[derive(Default)]
pub struct ContextMenuState {
    pending: Mutex<Option<PendingContextMenu>>,
    generations: AtomicU64,
}

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings = MenuItem::with_id(
        app,
        SETTINGS_MENU_ID,
        "Settings...",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(app, "Multi Desktop")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .item(&settings)
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .close_window()
        .build()?;

    let mut builder = MenuBuilder::new(app);
    #[cfg(target_os = "macos")]
    {
        builder = builder.item(&app_menu);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let file = SubmenuBuilder::new(app, "&File")
            .item(&settings)
            .close_window()
            .quit()
            .build()?;
        builder = builder.item(&file);
    }
    builder.item(&edit).item(&view).item(&window).build()
}

/// Route menu events: the Settings item navigates the renderer; context menu
/// items resolve the pending popup.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if id == SETTINGS_MENU_ID {
        if let Some(window) = show_main_window(app) {
            let _ = window.emit("navigate-to-settings", ());
        }
        return;
    }
    if let Some(index) = id.strip_prefix(CONTEXT_PREFIX) {
        let Ok(index) = index.parse::<usize>() else {
            return;
        };
        let state = app.state::<ContextMenuState>();
        let pending = state.pending.lock().ok().and_then(|mut guard| guard.take());
        if let Some(pending) = pending {
            let selected = pending.ids.get(index).cloned().flatten();
            let _ = pending.sender.send(ContextMenuMessage::Selected(selected));
        }
    }
}

/// Pop up a native context menu at the cursor and return the clicked item's
/// id, or `None` when the menu was dismissed.
#[tauri::command]
pub async fn show_context_menu(
    app: AppHandle,
    window: Window,
    items: Vec<NativeContextMenuItem>,
) -> Result<Option<String>, String> {
    if items.is_empty() {
        return Ok(None);
    }
    let mut builder = MenuBuilder::new(&app);
    let mut ids = Vec::new();
    for item in &items {
        if item.kind.as_deref() == Some("separator") {
            let separator = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
            builder = builder.item(&separator);
            continue;
        }
        let menu_id = format!("{CONTEXT_PREFIX}{}", ids.len());
        let label = item.label.clone().unwrap_or_default();
        let menu_item = MenuItem::with_id(
            &app,
            menu_id,
            label,
            item.enabled.unwrap_or(true),
            None::<&str>,
        )
        .map_err(|e| e.to_string())?;
        builder = builder.item(&menu_item);
        ids.push(item.id.clone());
    }
    let menu = builder.build().map_err(|e| e.to_string())?;

    let (sender, receiver) = channel();
    let generation = {
        let state = app.state::<ContextMenuState>();
        let generation = state.generations.fetch_add(1, Ordering::Relaxed);
        let mut guard = state.pending.lock().map_err(|e| e.to_string())?;
        if let Some(previous) = guard.replace(PendingContextMenu {
            generation,
            ids,
            sender: sender.clone(),
        }) {
            let _ = previous.sender.send(ContextMenuMessage::Closed);
        }
        generation
    };

    let popup_window = window.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = popup_window.popup_menu(&menu) {
            log::warn!("context menu popup failed: {err}");
            let _ = sender.send(ContextMenuMessage::Closed);
            return;
        }
        if cfg!(not(target_os = "linux")) {
            let _ = sender.send(ContextMenuMessage::Closed);
        }
    })
    .map_err(|e| e.to_string())?;

    let selection = blocking(move || match receiver.recv_timeout(CONTEXT_MENU_TIMEOUT) {
        Ok(ContextMenuMessage::Selected(id)) => id,
        Ok(ContextMenuMessage::Closed) => match receiver.recv_timeout(CLICK_GRACE) {
            Ok(ContextMenuMessage::Selected(id)) => id,
            Ok(ContextMenuMessage::Closed) | Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => None,
        },
        Err(_) => None,
    })
    .await?;

    // Clear our entry unless a newer popup already replaced it.
    let state = app.state::<ContextMenuState>();
    if let Ok(mut guard) = state.pending.lock()
        && guard.as_ref().is_some_and(|p| p.generation == generation)
    {
        guard.take();
    }
    Ok(selection)
}
