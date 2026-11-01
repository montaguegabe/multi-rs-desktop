//! Application menu and native context menus.
//!
//! Context menus pop up natively and resolve to the clicked item id (or
//! `None` when dismissed), matching the renderer's `showNativeContextMenu`
//! contract.

use std::sync::Mutex;
use std::sync::mpsc::{RecvTimeoutError, Sender, channel};
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

use crate::tasks::blocking;
use crate::window::show_main_window;

pub const SETTINGS_MENU_ID: &str = "settings";
const CONTEXT_PREFIX: &str = "ctx:";

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
    ids: Vec<Option<String>>,
    sender: Sender<ContextMenuMessage>,
}

/// The context menu currently shown, if any.
#[derive(Default)]
pub struct ContextMenuState(Mutex<Option<PendingContextMenu>>);

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
        let pending = state.0.lock().ok().and_then(|mut guard| guard.take());
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
    {
        let state = app.state::<ContextMenuState>();
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = Some(PendingContextMenu {
            ids,
            sender: sender.clone(),
        });
    }

    let popup_window = window.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = popup_window.popup_menu(&menu) {
            log::warn!("context menu popup failed: {err}");
        }
        let _ = sender.send(ContextMenuMessage::Closed);
    })
    .map_err(|e| e.to_string())?;

    let selection = blocking(move || {
        let overall = Duration::from_secs(120);
        match receiver.recv_timeout(overall) {
            Ok(ContextMenuMessage::Selected(id)) => id,
            Ok(ContextMenuMessage::Closed) => {
                // The click event may arrive just after the popup returns.
                match receiver.recv_timeout(Duration::from_millis(250)) {
                    Ok(ContextMenuMessage::Selected(id)) => id,
                    Ok(ContextMenuMessage::Closed) | Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => None,
                }
            }
            Err(_) => None,
        }
    })
    .await?;

    let state = app.state::<ContextMenuState>();
    if let Ok(mut guard) = state.0.lock() {
        guard.take();
    }
    Ok(selection)
}
