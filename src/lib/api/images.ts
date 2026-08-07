import { invoke } from '@tauri-apps/api/core';

/**
 * Image transfers go through Rust rather than `@tauri-apps/plugin-http`.
 *
 * The http plugin always attaches the webview's origin to the request, which is
 * `tauri://localhost` in a bundled app. MangaDex's CDN varies on `Origin` and
 * answers a non-http(s) one with a 59KB "You can read this at mangadex.org"
 * placeholder — HTTP 200, so it quietly replaces every page and cover. Dev runs
 * on `http://localhost:1420` and is allowed, so this only bit release builds.
 */

/** Fetch image bytes (epub covers and pages). */
export async function fetchImage(url: string): Promise<Uint8Array> {
  const res = await invoke<ArrayBuffer | number[]>('fetch_image', { url });
  return res instanceof ArrayBuffer ? new Uint8Array(res) : Uint8Array.from(res);
}

/** Download a page straight to disk; the bytes never cross the IPC boundary. */
export async function downloadPage(
  url: string,
  mangaId: string,
  chapterId: string,
  fileName: string
): Promise<void> {
  await invoke('download_page', { url, mangaId, chapterId, fileName });
}

/** Delete chapters that earlier builds filled with the placeholder image. */
export async function purgePlaceholderDownloads(): Promise<
  Array<{ mangaId: string; chapterId: string }>
> {
  return invoke('purge_placeholder_downloads');
}
