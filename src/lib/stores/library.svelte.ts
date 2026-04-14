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
  getMangaBatch,
} from '$lib/api/mangadex';
import type { LibraryEntry, ReadingProgress } from '$lib/api/types';

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) db = await Database.load('sqlite:mangadex.db');
  return db;
}

async function ensureMigrations() {
  const db = await getDb();
  await db.execute('ALTER TABLE library ADD COLUMN latest_chapter_id TEXT').catch(() => {});
  await db.execute('ALTER TABLE library ADD COLUMN total_chapters INTEGER NOT NULL DEFAULT 0').catch(() => {});
}

// State
let entries = $state<LibraryEntry[]>([]);
let progress = $state<Record<string, ReadingProgress[]>>({});
let progressSummary = $state<Record<string, number>>({}); // mangaId → completed chapter count
let mangasWithNewChapters = $state<Set<string>>(new Set());
let loading = $state(false);
let syncing = $state(false);
let checkingUpdates = $state(false);

async function load() {
  loading = true;
  try {
    await ensureMigrations();
    const db = await getDb();
    const rows = await db.select<Array<{
      id: string; title: string; cover_url: string | null; status: string;
      content_rating: string; tags: string; added_at: number; updated_at: number;
      latest_chapter_id: string | null; total_chapters: number;
    }>>(
      `SELECT id, title, cover_url, status, content_rating, tags, added_at, updated_at,
              latest_chapter_id, total_chapters
       FROM library ORDER BY updated_at DESC`
    );
    entries = rows.map((r) => ({
      id: r.id,
      title: r.title,
      coverUrl: r.cover_url ?? undefined,
      status: r.status as LibraryEntry['status'],
      contentRating: r.content_rating as LibraryEntry['contentRating'],
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags ?? [],
      addedAt: r.added_at,
      updatedAt: r.updated_at,
      latestChapterId: r.latest_chapter_id ?? undefined,
      totalChapters: r.total_chapters,
    }));

    // Load read-chapter counts in one query
    const progRows = await db.select<Array<{ manga_id: string; read_count: number }>>(
      'SELECT manga_id, COUNT(*) as read_count FROM reading_progress WHERE completed = 1 GROUP BY manga_id'
    );
    const summary: Record<string, number> = {};
    for (const row of progRows) {
      summary[row.manga_id] = row.read_count;
    }
    progressSummary = summary;
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
      const latestChapterId = manga.attributes.latestUploadedChapter ?? null;
      await db.execute(
        `INSERT INTO library (id, title, cover_url, status, content_rating, tags, added_at, updated_at, latest_chapter_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at,
           latest_chapter_id = COALESCE(latest_chapter_id, excluded.latest_chapter_id)`,
        [manga.id, title, manga.coverUrl ?? null, status, manga.attributes.contentRating, JSON.stringify([]), now, now, latestChapterId]
      );
    }

    await load();
  } catch (e) {
    console.error('MangaDex sync failed:', e);
  } finally {
    syncing = false;
  }
}

async function addToLibrary(entry: Omit<LibraryEntry, 'addedAt' | 'updatedAt' | 'latestChapterId' | 'totalChapters'>, latestChapterId?: string) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT OR REPLACE INTO library (id, title, cover_url, status, content_rating, tags, added_at, updated_at, latest_chapter_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.title, entry.coverUrl ?? null, entry.status, entry.contentRating, JSON.stringify(entry.tags ?? []), now, now, latestChapterId ?? null]
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
  const next = new Set(mangasWithNewChapters);
  next.delete(mangaId);
  mangasWithNewChapters = next;
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

async function updateChapterCount(mangaId: string, total: number) {
  const db = await getDb();
  await db.execute('UPDATE library SET total_chapters = ? WHERE id = ?', [total, mangaId]);
  entries = entries.map((e) => e.id === mangaId ? { ...e, totalChapters: total } : e);
}

/** After visiting a manga with new chapters, update the stored latest chapter ID to clear the badge. */
async function acknowledgeNewChapters(mangaId: string, latestChapterId: string) {
  const db = await getDb();
  await db.execute('UPDATE library SET latest_chapter_id = ? WHERE id = ?', [latestChapterId, mangaId]);
  entries = entries.map((e) => e.id === mangaId ? { ...e, latestChapterId } : e);
  const next = new Set(mangasWithNewChapters);
  next.delete(mangaId);
  mangasWithNewChapters = next;
}

/**
 * Batch-checks the MangaDex API for new chapters across all library manga.
 * Returns an array of manga IDs that have new chapters available.
 */
async function checkForNewChapters(): Promise<string[]> {
  if (entries.length === 0) return [];
  checkingUpdates = true;
  const newChapterMangaIds: string[] = [];

  try {
    const db = await getDb();
    const batchSize = 100;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const ids = batch.map((e) => e.id);
      const mangaList = await getMangaBatch(ids);

      for (const manga of mangaList) {
        const latest = manga.attributes.latestUploadedChapter;
        const entry = batch.find((e) => e.id === manga.id);
        if (!entry) continue;

        if (!entry.latestChapterId) {
          // First time we've seen this manga — just record the current latest, don't flag as new
          if (latest) {
            await db.execute('UPDATE library SET latest_chapter_id = ? WHERE id = ?', [latest, manga.id]);
            entries = entries.map((e) => e.id === manga.id ? { ...e, latestChapterId: latest } : e);
          }
        } else if (latest && latest !== entry.latestChapterId) {
          newChapterMangaIds.push(manga.id);
        }

        // Use lastChapter number as a totalChapters approximation when we don't have an exact count yet
        if (!entry.totalChapters) {
          const lastChapStr = manga.attributes.lastChapter;
          const approx = lastChapStr ? Math.ceil(parseFloat(lastChapStr)) : 0;
          if (approx > 0) {
            await db.execute('UPDATE library SET total_chapters = ? WHERE id = ?', [approx, manga.id]);
            entries = entries.map((e) => e.id === manga.id ? { ...e, totalChapters: approx } : e);
          }
        }
      }
    }

    mangasWithNewChapters = new Set(newChapterMangaIds);
  } catch (e) {
    console.error('Failed to check for new chapters:', e);
  } finally {
    checkingUpdates = false;
  }

  return newChapterMangaIds;
}

function hasNewChapters(mangaId: string): boolean {
  return mangasWithNewChapters.has(mangaId);
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
  const wasCompleted = idx >= 0 && existing[idx].completed;
  const entry: ReadingProgress = { mangaId, chapterId, page, completed, readAt: now };
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  progress = { ...progress, [mangaId]: existing };

  // Keep summary in sync
  if (completed && !wasCompleted) {
    progressSummary = { ...progressSummary, [mangaId]: (progressSummary[mangaId] ?? 0) + 1 };
  }

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
        // Refresh summary after remote merge
        progressSummary = { ...progressSummary, [mangaId]: local.filter((p) => p.completed).length };
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
  get checkingUpdates() { return checkingUpdates; },
  get progressSummary() { return progressSummary; },
  get newChapterCount() { return mangasWithNewChapters.size; },
  load,
  syncFromMangaDex,
  addToLibrary,
  removeFromLibrary,
  updateStatus,
  updateChapterCount,
  checkForNewChapters,
  acknowledgeNewChapters,
  hasNewChapters,
  isInLibrary,
  saveProgress,
  loadProgress,
  getChapterProgress,
  getProgressForManga,
};
