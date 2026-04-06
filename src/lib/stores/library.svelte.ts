import Database from '@tauri-apps/plugin-sql';
import {
  hasToken,
  getAllFollowedManga,
  getAllReadingStatuses,
  followManga,
  unfollowManga,
  setMangaReadingStatus,
  getReadChapters,
  markChaptersRead,
  getMangaTitle,
} from '$lib/api/mangadex';
import type { LibraryEntry, ReadingProgress } from '$lib/api/types';

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) db = await Database.load('sqlite:mangadex.db');
  return db;
}

// State
let entries = $state<LibraryEntry[]>([]);
let progress = $state<Record<string, ReadingProgress[]>>({});
let loading = $state(false);
let syncing = $state(false);

async function load() {
  loading = true;
  try {
    const db = await getDb();
    const rows = await db.select<LibraryEntry[]>(
      'SELECT id, title, cover_url as coverUrl, status, content_rating as contentRating, tags, added_at as addedAt, updated_at as updatedAt FROM library ORDER BY updated_at DESC'
    );
    entries = rows.map((r) => ({
      ...r,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags ?? [],
    }));
  } finally {
    loading = false;
  }
}

async function syncFromMangaDex() {
  if (!hasToken()) return;
  syncing = true;
  try {
    const [followed, statuses] = await Promise.all([
      getAllFollowedManga(),
      getAllReadingStatuses(),
    ]);

    if (followed.length === 0) return;

    const db = await getDb();
    const now = Date.now();

    for (const manga of followed) {
      const title = getMangaTitle(manga);
      const status = statuses[manga.id] ?? 'reading';
      await db.execute(
        `INSERT INTO library (id, title, cover_url, status, content_rating, tags, added_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        [manga.id, title, manga.coverUrl ?? null, status, manga.attributes.contentRating, JSON.stringify([]), now, now]
      );
    }

    await load();
  } catch (e) {
    console.error('MangaDex sync failed:', e);
  } finally {
    syncing = false;
  }
}

async function addToLibrary(entry: Omit<LibraryEntry, 'addedAt' | 'updatedAt'>) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT OR REPLACE INTO library (id, title, cover_url, status, content_rating, tags, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.title, entry.coverUrl ?? null, entry.status, entry.contentRating, JSON.stringify(entry.tags ?? []), now, now]
  );
  if (hasToken()) {
    await Promise.all([
      followManga(entry.id).catch(() => {}),
      setMangaReadingStatus(entry.id, entry.status).catch(() => {}),
    ]);
  }
  await load();
}

async function removeFromLibrary(mangaId: string) {
  const db = await getDb();
  await db.execute('DELETE FROM library WHERE id = ?', [mangaId]);
  entries = entries.filter((e) => e.id !== mangaId);
  if (hasToken()) {
    await unfollowManga(mangaId).catch(() => {});
  }
}

async function updateStatus(mangaId: string, status: string) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    'UPDATE library SET status = ?, updated_at = ? WHERE id = ?',
    [status, now, mangaId]
  );
  entries = entries.map((e) => e.id === mangaId ? { ...e, status: status as LibraryEntry['status'], updatedAt: now } : e);
  if (hasToken()) {
    await setMangaReadingStatus(mangaId, status).catch(() => {});
  }
}

function isInLibrary(mangaId: string): boolean {
  return entries.some((e) => e.id === mangaId);
}

// Reading progress
async function saveProgress(mangaId: string, chapterId: string, page: number, completed = false) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT OR REPLACE INTO reading_progress (manga_id, chapter_id, page, completed, read_at)
     VALUES (?, ?, ?, ?, ?)`,
    [mangaId, chapterId, page, completed ? 1 : 0, now]
  );
  const existing = progress[mangaId] ?? [];
  const idx = existing.findIndex((p) => p.chapterId === chapterId);
  const entry: ReadingProgress = { mangaId, chapterId, page, completed, readAt: now };
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  progress = { ...progress, [mangaId]: existing };

  if (completed && hasToken()) {
    await markChaptersRead(mangaId, [chapterId]).catch(() => {});
  }
}

async function loadProgress(mangaId: string): Promise<ReadingProgress[]> {
  const db = await getDb();
  const rows = await db.select<Array<{
    manga_id: string; chapter_id: string; page: number; completed: number; read_at: number;
  }>>(
    'SELECT manga_id, chapter_id, page, completed, read_at FROM reading_progress WHERE manga_id = ?',
    [mangaId]
  );
  const local = rows.map((r) => ({
    mangaId: r.manga_id,
    chapterId: r.chapter_id,
    page: r.page,
    completed: !!r.completed,
    readAt: r.read_at,
  }));

  // Merge read chapters from API
  if (hasToken()) {
    try {
      const remoteReadIds = await getReadChapters(mangaId);
      const localCompletedIds = new Set(local.filter((p) => p.completed).map((p) => p.chapterId));
      const toAdd = remoteReadIds.filter((id) => !localCompletedIds.has(id));

      if (toAdd.length > 0) {
        const now = Date.now();
        for (const chapterId of toAdd) {
          await db.execute(
            `INSERT OR IGNORE INTO reading_progress (manga_id, chapter_id, page, completed, read_at)
             VALUES (?, ?, 0, 1, ?)`,
            [mangaId, chapterId, now]
          );
          local.push({ mangaId, chapterId, page: 0, completed: true, readAt: now });
        }
      }
    } catch {
      // non-fatal — local progress is still valid
    }
  }

  progress = { ...progress, [mangaId]: local };
  return local;
}

function getChapterProgress(mangaId: string, chapterId: string): ReadingProgress | undefined {
  return (progress[mangaId] ?? []).find((p) => p.chapterId === chapterId);
}

function getProgressForManga(mangaId: string): ReadingProgress[] {
  return progress[mangaId] ?? [];
}

export const library = {
  get entries() { return entries; },
  get loading() { return loading; },
  get syncing() { return syncing; },
  load,
  syncFromMangaDex,
  addToLibrary,
  removeFromLibrary,
  updateStatus,
  isInLibrary,
  saveProgress,
  loadProgress,
  getChapterProgress,
  getProgressForManga,
};
