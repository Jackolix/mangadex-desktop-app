import Database from '@tauri-apps/plugin-sql';
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

async function addToLibrary(entry: Omit<LibraryEntry, 'addedAt' | 'updatedAt'>) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT OR REPLACE INTO library (id, title, cover_url, status, content_rating, tags, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entry.id, entry.title, entry.coverUrl ?? null, entry.status, entry.contentRating, JSON.stringify(entry.tags ?? []), now, now]
  );
  await load();
}

async function removeFromLibrary(mangaId: string) {
  const db = await getDb();
  await db.execute('DELETE FROM library WHERE id = ?', [mangaId]);
  entries = entries.filter((e) => e.id !== mangaId);
}

async function updateStatus(mangaId: string, status: string) {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    'UPDATE library SET status = ?, updated_at = ? WHERE id = ?',
    [status, now, mangaId]
  );
  entries = entries.map((e) => e.id === mangaId ? { ...e, status: status as LibraryEntry['status'], updatedAt: now } : e);
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
  // Update in-memory
  const existing = progress[mangaId] ?? [];
  const idx = existing.findIndex((p) => p.chapterId === chapterId);
  const entry: ReadingProgress = { mangaId, chapterId, page, completed, readAt: now };
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  progress = { ...progress, [mangaId]: existing };
}

async function loadProgress(mangaId: string): Promise<ReadingProgress[]> {
  const db = await getDb();
  const rows = await db.select<Array<{
    manga_id: string; chapter_id: string; page: number; completed: number; read_at: number;
  }>>(
    'SELECT manga_id, chapter_id, page, completed, read_at FROM reading_progress WHERE manga_id = ?',
    [mangaId]
  );
  const result = rows.map((r) => ({
    mangaId: r.manga_id,
    chapterId: r.chapter_id,
    page: r.page,
    completed: !!r.completed,
    readAt: r.read_at,
  }));
  progress = { ...progress, [mangaId]: result };
  return result;
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
  load,
  addToLibrary,
  removeFromLibrary,
  updateStatus,
  isInLibrary,
  saveProgress,
  loadProgress,
  getChapterProgress,
  getProgressForManga,
};
