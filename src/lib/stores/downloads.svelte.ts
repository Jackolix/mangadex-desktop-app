import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeFile, exists, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getAtHomeServer } from '$lib/api/mangadex';
import type { DownloadEntry } from '$lib/api/types';

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) db = await Database.load('sqlite:mangadex.db');
  return db;
}

// State
let downloads = $state<DownloadEntry[]>([]);
let activeDownloads = $state<Set<string>>(new Set());

async function init() {
  await loadDownloads();
}

async function loadDownloads() {
  const database = await getDb();
  const rows = await database.select<Array<{
    chapter_id: string; manga_id: string; manga_title: string | null;
    chapter_title: string | null; volume: string | null; chapter_num: string | null;
    status: string; path: string | null; total_pages: number;
    downloaded_pages: number; created_at: number; completed_at: number | null;
  }>>('SELECT * FROM downloads ORDER BY created_at DESC');

  downloads = rows.map((r) => ({
    chapterId: r.chapter_id,
    mangaId: r.manga_id,
    mangaTitle: r.manga_title ?? undefined,
    chapterTitle: r.chapter_title ?? undefined,
    volume: r.volume ?? undefined,
    chapterNum: r.chapter_num ?? undefined,
    status: r.status as DownloadEntry['status'],
    path: r.path ?? undefined,
    totalPages: r.total_pages,
    downloadedPages: r.downloaded_pages,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  }));
}

async function queueDownload(entry: Omit<DownloadEntry, 'status' | 'downloadedPages' | 'createdAt'>) {
  const database = await getDb();
  const now = Date.now();

  await database.execute(
    `INSERT OR REPLACE INTO downloads
     (chapter_id, manga_id, manga_title, chapter_title, volume, chapter_num, status, total_pages, downloaded_pages, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?)`,
    [
      entry.chapterId, entry.mangaId, entry.mangaTitle ?? null,
      entry.chapterTitle ?? null, entry.volume ?? null, entry.chapterNum ?? null,
      entry.totalPages, now,
    ]
  );

  downloads = [
    { ...entry, status: 'pending', downloadedPages: 0, createdAt: now },
    ...downloads.filter((d) => d.chapterId !== entry.chapterId),
  ];

  // Don't await — run in background
  startDownload(entry.mangaId, entry.chapterId);
}

async function startDownload(mangaId: string, chapterId: string) {
  if (activeDownloads.has(chapterId)) return;

  activeDownloads = new Set([...activeDownloads, chapterId]);

  const database = await getDb();
  await database.execute("UPDATE downloads SET status = 'downloading' WHERE chapter_id = ?", [chapterId]);
  downloads = downloads.map((d) =>
    d.chapterId === chapterId ? { ...d, status: 'downloading' } : d
  );

  try {
    console.log(`[download] Starting chapter ${chapterId} for manga ${mangaId}`);
    const server = await getAtHomeServer(chapterId);
    const useDataSaver = server.chapter.data.length === 0;
    const pageFilenames = useDataSaver ? server.chapter.dataSaver : server.chapter.data;
    const quality = useDataSaver ? 'data-saver' : 'data';
    console.log(`[download] Got server: ${server.baseUrl}, pages: ${pageFilenames.length} quality=${quality}`);
    if (pageFilenames.length === 0) throw new Error('Chapter has no downloadable pages');
    const total = pageFilenames.length;

    // Create download directory
    const dir = `downloads/${mangaId}/${chapterId}`;
    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });

    // Update total pages
    await database.execute('UPDATE downloads SET total_pages = ? WHERE chapter_id = ?', [total, chapterId]);
    downloads = downloads.map((d) =>
      d.chapterId === chapterId ? { ...d, totalPages: total } : d
    );

    // Download each page
    for (let i = 0; i < pageFilenames.length; i++) {
      const filename = pageFilenames[i];
      const url = `${server.baseUrl}/${quality}/${server.chapter.hash}/${filename}`;
      const ext = filename.split('.').pop() ?? 'jpg';
      const pagePath = `${dir}/${String(i).padStart(3, '0')}.${ext}`;

      // Skip pages already saved (resume support)
      const pageExists = await exists(pagePath, { baseDir: BaseDirectory.AppData });
      if (!pageExists) {
        console.log(`[download] Fetching page ${i + 1}/${total}: ${url}`);
        const resp = await tauriFetch(url);
        if (!resp.ok) throw new Error(`Page ${i + 1} fetch failed: HTTP ${resp.status} for ${url}`);
        await writeFile(pagePath, new Uint8Array(await resp.arrayBuffer()), {
          baseDir: BaseDirectory.AppData,
        });
        console.log(`[download] Saved page ${i + 1} → ${pagePath}`);
      }

      // Update progress in memory every page, DB every 5 pages
      const downloaded = i + 1;
      downloads = downloads.map((d) =>
        d.chapterId === chapterId ? { ...d, downloadedPages: downloaded } : d
      );
      if (downloaded % 5 === 0 || downloaded === total) {
        await database.execute(
          'UPDATE downloads SET downloaded_pages = ? WHERE chapter_id = ?',
          [downloaded, chapterId]
        );
      }
    }

    // Mark completed
    const now = Date.now();
    await database.execute(
      "UPDATE downloads SET status = 'completed', downloaded_pages = ?, total_pages = ?, completed_at = ? WHERE chapter_id = ?",
      [total, total, now, chapterId]
    );
    downloads = downloads.map((d) =>
      d.chapterId === chapterId
        ? { ...d, status: 'completed', downloadedPages: total, completedAt: now }
        : d
    );
  } catch (e) {
    console.error(`[download] FAILED chapter ${chapterId}:`, e instanceof Error ? e.message : e, e);
    await database.execute(
      "UPDATE downloads SET status = 'error' WHERE chapter_id = ?",
      [chapterId]
    );
    downloads = downloads.map((d) =>
      d.chapterId === chapterId ? { ...d, status: 'error' } : d
    );
  } finally {
    activeDownloads.delete(chapterId);
    activeDownloads = new Set(activeDownloads);
  }
}

async function deleteDownload(mangaId: string, chapterId: string) {
  // Delete files via Rust (reliable recursive dir removal)
  await invoke('delete_chapter_download', { mangaId, chapterId }).catch(() => {
    // Fallback: try TS-side removal
    return remove(`downloads/${mangaId}/${chapterId}`, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    }).catch(() => {});
  });
  const database = await getDb();
  await database.execute('DELETE FROM downloads WHERE chapter_id = ?', [chapterId]);
  downloads = downloads.filter((d) => d.chapterId !== chapterId);
}

function isDownloaded(chapterId: string): boolean {
  return downloads.some((d) => d.chapterId === chapterId && d.status === 'completed');
}

function isDownloading(chapterId: string): boolean {
  return activeDownloads.has(chapterId);
}

function getDownload(chapterId: string): DownloadEntry | undefined {
  return downloads.find((d) => d.chapterId === chapterId);
}

export const downloadsStore = {
  get downloads() { return downloads; },
  get activeDownloads() { return activeDownloads; },
  init,
  loadDownloads,
  queueDownload,
  deleteDownload,
  isDownloaded,
  isDownloading,
  getDownload,
  cleanup() {},
};
