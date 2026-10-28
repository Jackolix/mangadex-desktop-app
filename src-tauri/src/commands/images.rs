use reqwest::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Image fetching deliberately does NOT go through `tauri-plugin-http`.
///
/// That plugin always stamps the webview's origin onto every request, and in a
/// bundled app that origin is `tauri://localhost`. MangaDex's CDN varies on
/// `Origin` and answers any non-http(s) origin with a 59KB "You can read this
/// at mangadex.org" placeholder — served as HTTP 200, so nothing looks wrong
/// until you open the epub. Dev builds run on `http://localhost:1420`, which is
/// allowed, so the bug only ever showed up in release bundles. reqwest sends no
/// `Origin` at all.
static CLIENT: OnceLock<Client> = OnceLock::new();

fn client() -> &'static Client {
    CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent(concat!("mangadex-desktop/", env!("CARGO_PKG_VERSION")))
            // A stalled @Home node must fail the page rather than hang the
            // whole download or epub export forever.
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

/// SHA-256 of the placeholder described above. It is a single static asset
/// shared by the @Home network and uploads.mangadex.org, identical for `data`
/// and `data-saver`. Rejecting it keeps a refused request from silently landing
/// on disk or in an epub if MangaDex ever starts serving it for another reason.
const PLACEHOLDER_SHA256: &str = "699b7af33aa5af1ee858b31c2434fabf8bc128b520cda11561b6358096efc1da";
const PLACEHOLDER_LEN: u64 = 59_480;

fn is_placeholder(bytes: &[u8]) -> bool {
    // Length gate first so real (multi-MB) pages are never hashed.
    bytes.len() as u64 == PLACEHOLDER_LEN
        && format!("{:x}", Sha256::digest(bytes)) == PLACEHOLDER_SHA256
}

async fn get_image_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = client().get(url).send().await.map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} for {url}"));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?.to_vec();

    if is_placeholder(&bytes) {
        return Err(format!(
            "MangaDex returned its placeholder image instead of {url}"
        ));
    }

    Ok(bytes)
}

/// Fetch image bytes into the frontend (epub covers and pages).
#[tauri::command]
pub async fn fetch_image(url: String) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(get_image_bytes(&url).await?))
}

/// Download one page straight to disk. Kept on this side of the IPC boundary so
/// page bytes never have to cross it.
#[tauri::command]
pub async fn download_page(
    app: AppHandle,
    url: String,
    manga_id: String,
    chapter_id: String,
    file_name: String,
) -> Result<(), String> {
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err(format!("Invalid page file name: {file_name}"));
    }

    let dir = chapter_dir(&app, &manga_id, &chapter_id)?;
    let path = dir.join(&file_name);

    if path.exists() {
        return Ok(());
    }

    let bytes = get_image_bytes(&url).await?;

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgedChapter {
    pub manga_id: String,
    pub chapter_id: String,
}

/// Delete chapters that earlier builds filled with the placeholder image.
///
/// A chapter is dropped whole rather than per-page: a half-real chapter would
/// still export a broken epub, and re-downloading is cheap.
#[tauri::command]
pub async fn purge_placeholder_downloads(app: AppHandle) -> Result<Vec<PurgedChapter>, String> {
    let downloads_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("downloads");

    if !downloads_dir.exists() {
        return Ok(vec![]);
    }

    let mut purged = Vec::new();

    for manga_entry in read_dirs(&downloads_dir) {
        let manga_id = manga_entry
            .file_name()
            .map(|n| n.to_string_lossy().to_string());
        let Some(manga_id) = manga_id else { continue };

        for chapter_entry in read_dirs(&manga_entry) {
            let chapter_id = chapter_entry
                .file_name()
                .map(|n| n.to_string_lossy().to_string());
            let Some(chapter_id) = chapter_id else {
                continue;
            };

            if !chapter_has_placeholder(&chapter_entry) {
                continue;
            }

            if std::fs::remove_dir_all(&chapter_entry).is_ok() {
                purged.push(PurgedChapter {
                    manga_id: manga_id.clone(),
                    chapter_id,
                });
            }
        }
    }

    Ok(purged)
}

fn chapter_has_placeholder(chapter_dir: &PathBuf) -> bool {
    let Ok(entries) = std::fs::read_dir(chapter_dir) else {
        return false;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Stat before reading so only same-sized candidates are ever loaded.
        match entry.metadata() {
            Ok(meta) if meta.len() == PLACEHOLDER_LEN => {}
            _ => continue,
        }
        if std::fs::read(&path).map(|b| is_placeholder(&b)).unwrap_or(false) {
            return true;
        }
    }

    false
}

fn read_dirs(dir: &PathBuf) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect()
        })
        .unwrap_or_default()
}

fn chapter_dir(app: &AppHandle, manga_id: &str, chapter_id: &str) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("downloads")
        .join(manga_id)
        .join(chapter_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pins the regression: pages must come back as real images, and the
    /// placeholder MangaDex serves for a rejected `Origin` must be rejected.
    /// Hits the network, so it is opt-in: `cargo test -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn fetches_real_pages_and_rejects_the_placeholder() {
        #[derive(serde::Deserialize)]
        struct AtHome {
            #[serde(rename = "baseUrl")]
            base_url: String,
            chapter: Chapter,
        }
        #[derive(serde::Deserialize)]
        struct Chapter {
            hash: String,
            data: Vec<String>,
        }

        // Any chapter will do; take the first English one MangaDex offers.
        let chapter_id: String = {
            let feed: serde_json::Value = client()
                .get("https://api.mangadex.org/chapter?limit=1&translatedLanguage[]=en")
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            feed["data"][0]["id"].as_str().unwrap().to_string()
        };

        let at_home: AtHome = client()
            .get(format!(
                "https://api.mangadex.org/at-home/server/{chapter_id}"
            ))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();

        let url = format!(
            "{}/data/{}/{}",
            at_home.base_url, at_home.chapter.hash, at_home.chapter.data[0]
        );

        // Our client sends no Origin, so this is the real page.
        let bytes = get_image_bytes(&url).await.expect("page fetch failed");
        assert!(!is_placeholder(&bytes), "got the placeholder image");
        assert!(bytes.len() > PLACEHOLDER_LEN as usize);

        // Stamping the origin a bundled webview would send reproduces the bug,
        // and is_placeholder recognises the result.
        let rejected = client()
            .get(&url)
            .header(reqwest::header::ORIGIN, "tauri://localhost")
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert!(
            is_placeholder(&rejected),
            "expected the mangadex.org placeholder for a tauri:// origin"
        );
    }
}
