import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DownloadEntry } from '$lib/api/types';

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) db = await Database.load('sqlite:mangadex.db');
  return db;
}

// State
let downloads = $state<DownloadEntry[]>([]);
let activeDownloads = $state<Set<string>>(new Set());

// Listen for progress events
let unlistenProgress: (() => void) | null = null;

async function init() {
  await loadDownloads();

  unlistenProgress = await listen<{
    chapter_id: string;
    page: number;
    total: number;
    status: string;
  }>('download_progress', async ({ payload }) => {
    const { chapter_id, page, total, status } = payload;

    // Update in memory
    downloads = downloads.map((d) =>
      d.chapterId === chapter_id
        ? { ...d, downloadedPages: page, totalPages: total, status: status as DownloadEntry['status'] }
        : d
    );

    if (status === 'completed') {
      // Update DB
      const db = await getDb();
      await db.execute(
        'UPDATE downloads SET status = ?, downloaded_pages = ?, total_pages = ?, completed_at = ? WHERE chapter_id = ?',
        ['completed', total, total, Date.now(), chapter_id]
      );
      activeDownloads.delete(chapter_id);
      activeDownloads = new Set(activeDownloads);
    } else {
      // Update progress in DB
      const db = await getDb();
      await db.execute(
        'UPDATE downloads SET downloaded_pages = ?, total_pages = ? WHERE chapter_id = ?',
        [page, total, chapter_id]
      );
    }
  });
}

async function loadDownloads() {
  const db = await getDb();
  const rows = await db.select<Array<{
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
  const db = await getDb();
  const now = Date.now();

  await db.execute(
    `INSERT OR REPLACE INTO downloads
     (chapter_id, manga_id, manga_title, chapter_title, volume, chapter_num, status, total_pages, downloaded_pages, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?)`,
    [
      entry.chapterId, entry.mangaId, entry.mangaTitle ?? null,
      entry.chapterTitle ?? null, entry.volume ?? null, entry.chapterNum ?? null,
      entry.totalPages, now
    ]
  );

  downloads = [
    {
      ...entry,
      status: 'pending',
      downloadedPages: 0,
      createdAt: now,
    },
    ...downloads.filter((d) => d.chapterId !== entry.chapterId),
  ];

  // Start download
  await startDownload(entry.mangaId, entry.chapterId);
}

async function startDownload(mangaId: string, chapterId: string) {
  if (activeDownloads.has(chapterId)) return;

  activeDownloads.add(chapterId);
  activeDownloads = new Set(activeDownloads);

  // Update status
  const db = await getDb();
  await db.execute("UPDATE downloads SET status = 'downloading' WHERE chapter_id = ?", [chapterId]);
  downloads = downloads.map((d) =>
    d.chapterId === chapterId ? { ...d, status: 'downloading' } : d
  );

  try {
    const path = await invoke<string>('download_chapter', {
      mangaId,
      chapterId,
      useDataSaver: false,
    });

    await db.execute(
      'UPDATE downloads SET path = ? WHERE chapter_id = ?',
      [path, chapterId]
    );
  } catch (e) {
    await db.execute(
      "UPDATE downloads SET status = 'error' WHERE chapter_id = ?",
      [chapterId]
    );
    downloads = downloads.map((d) =>
      d.chapterId === chapterId ? { ...d, status: 'error' } : d
    );
    activeDownloads.delete(chapterId);
    activeDownloads = new Set(activeDownloads);
  }
}

async function deleteDownload(mangaId: string, chapterId: string) {
  await invoke('delete_chapter_download', { mangaId, chapterId });
  const db = await getDb();
  await db.execute('DELETE FROM downloads WHERE chapter_id = ?', [chapterId]);
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
  cleanup() {
    unlistenProgress?.();
  },
};
