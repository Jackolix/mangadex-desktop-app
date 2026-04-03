use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub chapter_id: String,
    pub page: usize,
    pub total: usize,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AtHomeResponse {
    pub result: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    pub chapter: ChapterData,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChapterData {
    pub hash: String,
    pub data: Vec<String>,
    #[serde(rename = "dataSaver")]
    pub data_saver: Vec<String>,
}

#[tauri::command]
pub async fn download_chapter(
    app: AppHandle,
    manga_id: String,
    chapter_id: String,
    use_data_saver: bool,
) -> Result<String, String> {
    let client = Client::new();

    // Fetch chapter server info
    let at_home_url = format!(
        "https://api.mangadex.org/at-home/server/{}",
        chapter_id
    );
    let response: AtHomeResponse = client
        .get(&at_home_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let pages = if use_data_saver {
        &response.chapter.data_saver
    } else {
        &response.chapter.data
    };

    let quality = if use_data_saver { "data-saver" } else { "data" };
    let total = pages.len();

    // Get app data dir
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let chapter_dir = app_data_dir
        .join("downloads")
        .join(&manga_id)
        .join(&chapter_id);

    std::fs::create_dir_all(&chapter_dir).map_err(|e| e.to_string())?;

    // Download each page
    for (i, filename) in pages.iter().enumerate() {
        let page_url = format!(
            "{}/{}/{}/{}",
            response.base_url, quality, response.chapter.hash, filename
        );

        let ext = filename.split('.').last().unwrap_or("jpg");
        let page_path = chapter_dir.join(format!("{:03}.{}", i, ext));

        // Skip if already downloaded
        if page_path.exists() {
            app.emit(
                "download_progress",
                DownloadProgress {
                    chapter_id: chapter_id.clone(),
                    page: i + 1,
                    total,
                    status: "downloading".to_string(),
                },
            )
            .ok();
            continue;
        }

        let response = client
            .get(&page_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        std::fs::write(&page_path, &bytes).map_err(|e| e.to_string())?;

        app.emit(
            "download_progress",
            DownloadProgress {
                chapter_id: chapter_id.clone(),
                page: i + 1,
                total,
                status: "downloading".to_string(),
            },
        )
        .ok();
    }

    app.emit(
        "download_progress",
        DownloadProgress {
            chapter_id: chapter_id.clone(),
            page: total,
            total,
            status: "completed".to_string(),
        },
    )
    .ok();

    Ok(chapter_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_chapter_pages(
    app: AppHandle,
    manga_id: String,
    chapter_id: String,
) -> Result<Vec<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let chapter_dir = app_data_dir
        .join("downloads")
        .join(&manga_id)
        .join(&chapter_id);

    if !chapter_dir.exists() {
        return Err("Chapter not downloaded".to_string());
    }

    let mut pages: Vec<String> = std::fs::read_dir(&chapter_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_file() {
                Some(path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();

    pages.sort();
    Ok(pages)
}

#[tauri::command]
pub async fn delete_chapter_download(
    app: AppHandle,
    manga_id: String,
    chapter_id: String,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let chapter_dir = app_data_dir
        .join("downloads")
        .join(&manga_id)
        .join(&chapter_id);

    if chapter_dir.exists() {
        std::fs::remove_dir_all(&chapter_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_downloaded_manga(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let downloads_dir = app_data_dir.join("downloads");

    if !downloads_dir.exists() {
        return Ok(vec![]);
    }

    let manga_list: Vec<serde_json::Value> = std::fs::read_dir(&downloads_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_dir() {
                let manga_id = path.file_name()?.to_string_lossy().to_string();
                let chapters: Vec<String> = std::fs::read_dir(&path)
                    .ok()?
                    .filter_map(|ch| {
                        let ch = ch.ok()?;
                        if ch.path().is_dir() {
                            Some(ch.file_name().to_string_lossy().to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                Some(serde_json::json!({
                    "manga_id": manga_id,
                    "chapters": chapters,
                }))
            } else {
                None
            }
        })
        .collect();

    Ok(manga_list)
}

#[tauri::command]
pub async fn is_chapter_downloaded(
    app: AppHandle,
    manga_id: String,
    chapter_id: String,
) -> Result<bool, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let chapter_dir = app_data_dir
        .join("downloads")
        .join(&manga_id)
        .join(&chapter_id);

    Ok(chapter_dir.exists()
        && std::fs::read_dir(&chapter_dir)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false))
}
