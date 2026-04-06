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

const MAX_CONCURRENT_CHAPTERS = 3;

type BatchChapter = Omit<DownloadEntry, 'status' | 'downloadedPages' | 'createdAt'>;

interface MangaBatch {
  mangaId: string;
  mangaTitle: string;
  chapters: BatchChapter[];
}

// State
let downloads = $state<DownloadEntry[]>([]);
let activeDownloads = $state<Set<string>>(new Set());
let chapterQueue: Array<{ mangaId: string; chapterId: string }> = [];

// Manga-level batch queue
let pendingBatches: MangaBatch[] = [];
let mangaBatchQueue = $state<Array<{ mangaId: string; mangaTitle: string }>>([]);
let activeBatch: { mangaId: string; pendingIds: Set<string> } | null = null;

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

async function queueMangaBatch(mangaId: string, mangaTitle: string, allChapters: BatchChapter[]): Promise<number> {
  const toDownload = allChapters.filter(
    (ch) => !isDownloaded(ch.chapterId) && !isDownloading(ch.chapterId)
  );
  if (toDownload.length === 0) return 0;

  if (!activeBatch) {
    // No active batch — start immediately
    activeBatch = { mangaId, pendingIds: new Set(toDownload.map((c) => c.chapterId)) };
    for (const ch of toDownload) {
      await queueDownload(ch);
    }
  } else {
    // Another batch is running — enqueue this one
    pendingBatches.push({ mangaId, mangaTitle, chapters: toDownload });
    mangaBatchQueue = pendingBatches.map((b) => ({ mangaId: b.mangaId, mangaTitle: b.mangaTitle }));
  }
  return toDownload.length;
}

async function startNextBatch() {
  const next = pendingBatches.shift();
  mangaBatchQueue = pendingBatches.map((b) => ({ mangaId: b.mangaId, mangaTitle: b.mangaTitle }));
  if (!next) {
    activeBatch = null;
    return;
  }
  activeBatch = { mangaId: next.mangaId, pendingIds: new Set(next.chapters.map((c) => c.chapterId)) };
  for (const ch of next.chapters) {
    await queueDownload(ch);
  }
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
  if (activeDownloads.size < MAX_CONCURRENT_CHAPTERS) {
    startDownload(entry.mangaId, entry.chapterId);
  } else {
    chapterQueue.push({ mangaId: entry.mangaId, chapterId: entry.chapterId });
    // Update DB and state to reflect queued status
    database.execute("UPDATE downloads SET status = 'queued' WHERE chapter_id = ?", [entry.chapterId]);
    downloads = downloads.map((d) =>
      d.chapterId === entry.chapterId ? { ...d, status: 'queued' } : d
    );
  }
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

    // Download pages in parallel with a concurrency limit
    const CONCURRENCY = 5;
    let completedCount = 0;

    async function downloadPage(i: number, filename: string) {
      const url = `${server.baseUrl}/${quality}/${server.chapter.hash}/${filename}`;
      const ext = filename.split('.').pop() ?? 'jpg';
      const pagePath = `${dir}/${String(i).padStart(3, '0')}.${ext}`;

      const pageExists = await exists(pagePath, { baseDir: BaseDirectory.AppData });
      if (!pageExists) {
        const resp = await tauriFetch(url);
        if (!resp.ok) throw new Error(`Page ${i + 1} fetch failed: HTTP ${resp.status}`);
        await writeFile(pagePath, new Uint8Array(await resp.arrayBuffer()), {
          baseDir: BaseDirectory.AppData,
        });
      }

      completedCount++;
      downloads = downloads.map((d) =>
        d.chapterId === chapterId ? { ...d, downloadedPages: completedCount } : d
      );
      if (completedCount % 5 === 0 || completedCount === total) {
        await database.execute(
          'UPDATE downloads SET downloaded_pages = ? WHERE chapter_id = ?',
          [completedCount, chapterId]
        );
      }
    }

    // Run with bounded concurrency using a pool of workers
    const queue = pageFilenames.map((filename, i) => ({ i, filename }));
    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await downloadPage(item.i, item.filename);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

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

    // Track batch completion
    if (activeBatch) {
      activeBatch.pendingIds.delete(chapterId);
      if (activeBatch.pendingIds.size === 0) {
        // This batch is fully done — start next batch (it will queue its own chapters)
        await startNextBatch();
        return;
      }
    }

    // Start next queued chapter if any
    const next = chapterQueue.shift();
    if (next) startDownload(next.mangaId, next.chapterId);
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
  get mangaBatchQueue() { return mangaBatchQueue; },
  init,
  loadDownloads,
  queueDownload,
  queueMangaBatch,
  deleteDownload,
  isDownloaded,
  isDownloading,
  getDownload,
  cleanup() {},
};
