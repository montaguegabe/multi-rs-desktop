//! Multi Desktop: a Tauri shell over `multi-core` for inspecting multi
//! workspaces, committing across their repos and syncing them.

mod deep_link;
mod git_ops;
mod menu;
mod openai;
mod paths;
mod projects;
mod store;
mod tasks;
mod window;

use tauri::RunEvent;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = window::show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(menu::ContextMenuState::default())
        .manage(deep_link::PendingNavigation::default())
        .setup(|app| {
            let handle = app.handle().clone();
            app.set_menu(menu::build_app_menu(&handle)?)?;
            app.on_menu_event(|app, event| menu::handle_menu_event(app, event.id().as_ref()));

            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();
            }
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                deep_link::handle_urls(&handle, &urls);
            }
            let link_handle = handle.clone();
            app.deep_link().on_open_url(move |event| {
                deep_link::handle_urls(&link_handle, event.urls().as_slice());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projects::get_projects_summary,
            projects::get_project_statuses,
            projects::get_project_detail,
            projects::get_history_group_diff,
            store::get_config_path,
            store::add_repo,
            store::remove_repo,
            store::get_open_ai_api_key,
            store::set_open_ai_api_key,
            git_ops::stage_selection,
            git_ops::commit,
            git_ops::push,
            git_ops::create_private_repo_and_push,
            git_ops::discard_file,
            git_ops::discard_lines,
            git_ops::open_in_github_web,
            git_ops::reveal_in_finder,
            git_ops::open_in_cursor,
            git_ops::open_in_github_desktop,
            openai::generate_commit_message,
            menu::show_context_menu,
            deep_link::take_pending_navigation,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // macOS: closing the last window keeps the app running in the dock.
        #[cfg(target_os = "macos")]
        RunEvent::ExitRequested {
            api, code: None, ..
        } => api.prevent_exit(),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            let _ = window::show_main_window(app);
        }
        _ => {
            let _ = app;
        }
    });
}
