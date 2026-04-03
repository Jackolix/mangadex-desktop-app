mod commands;
use commands::download::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:mangadex.db",
                    vec![tauri_plugin_sql::Migration {
                        version: 1,
                        description: "Initial schema",
                        sql: include_str!("../migrations/001_initial.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            download_chapter,
            get_chapter_pages,
            delete_chapter_download,
            get_downloaded_manga,
            is_chapter_downloaded,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
