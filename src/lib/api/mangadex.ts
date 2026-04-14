import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type {
  ApiResponse,
  AtHomeServer,
  AuthResponse,
  Chapter,
  ChapterAggregate,
  ChapterSearchParams,
  ContentRating,
  Manga,
  MangaSearchParams,
  MangaWithCover,
  User,
} from './types';

const BASE_URL = 'https://api.mangadex.org';
const AUTH_URL = 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token';
const COVER_BASE = 'https://uploads.mangadex.org/covers';

// Token storage
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

export function hasToken() {
  return !!accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit & { params?: Record<string, unknown> } = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${BASE_URL}${path}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          searchParams.append(`${key}[]`, String(v));
        }
      } else if (typeof value === 'object') {
        // Nested objects like order: { followedCount: 'desc' } → order[followedCount]=desc
        for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
          if (nestedValue !== undefined && nestedValue !== null) {
            searchParams.append(`${key}[${nestedKey}]`, String(nestedValue));
          }
        }
      } else {
        searchParams.append(key, String(value));
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await tauriFetch(url, { ...fetchOptions, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ result: 'error' }));
    throw new Error(
      error?.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authRequest(params: Record<string, string>): Promise<AuthResponse> {
  const body = new URLSearchParams(params);
  const response = await tauriFetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error_description || `Auth failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function login(
  username: string,
  password: string,
  clientId: string,
  clientSecret: string
): Promise<AuthResponse> {
  const res = await authRequest({
    grant_type: 'password',
    username,
    password,
    client_id: clientId,
    client_secret: clientSecret,
  });
  setTokens(res.access_token, res.refresh_token);
  return res;
}

export async function refreshSession(clientId: string, clientSecret: string): Promise<AuthResponse> {
  if (!refreshToken) throw new Error('No refresh token');
  const res = await authRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  setTokens(res.access_token, res.refresh_token);
  return res;
}

export async function logout(): Promise<void> {
  clearTokens();
}

export async function getMe(): Promise<User> {
  const res = await request<ApiResponse<User>>('/user/me');
  return res.data;
}

// ── Manga ─────────────────────────────────────────────────────────────────────

export async function searchManga(
  params: MangaSearchParams = {}
): Promise<{ data: MangaWithCover[]; total: number }> {
  const defaultParams = {
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
    contentRating: params.contentRating ?? ['safe', 'suggestive'],
    includes: ['cover_art', 'author', 'artist'],
    order: params.order ?? { relevance: 'desc' },
    ...params,
  };

  const res = await request<ApiResponse<Manga[]>>('/manga', { params: defaultParams as never });
  const data = res.data.map(enrichManga);
  return { data, total: res.total ?? 0 };
}

export async function getManga(id: string): Promise<MangaWithCover> {
  const res = await request<ApiResponse<Manga>>(`/manga/${id}`, {
    params: { includes: ['cover_art', 'author', 'artist', 'tag'] },
  });
  return enrichManga(res.data);
}

export async function getFeaturedManga(): Promise<MangaWithCover[]> {
  const res = await searchManga({
    limit: 10,
    order: { followedCount: 'desc' },
    contentRating: ['safe'],
  });
  return res.data;
}

export async function getRecentlyUpdated(limit = 20): Promise<MangaWithCover[]> {
  const res = await searchManga({
    limit,
    order: { latestUploadedChapter: 'desc' },
    contentRating: ['safe', 'suggestive'],
  });
  return res.data;
}

export async function getTopManga(limit = 20): Promise<MangaWithCover[]> {
  const res = await searchManga({
    limit,
    order: { rating: 'desc' },
    contentRating: ['safe', 'suggestive'],
  });
  return res.data;
}

export async function getMangaByTag(tagId: string, limit = 20): Promise<MangaWithCover[]> {
  const res = await searchManga({
    limit,
    includedTags: [tagId],
    order: { followedCount: 'desc' },
  });
  return res.data;
}

// ── Chapters ──────────────────────────────────────────────────────────────────

export async function getMangaChapters(
  mangaId: string,
  params: Partial<ChapterSearchParams> = {}
): Promise<{ data: Chapter[]; total: number }> {
  const res = await request<ApiResponse<Chapter[]>>(`/manga/${mangaId}/feed`, {
    params: {
      limit: 500,
      translatedLanguage: ['en'],
      order: { volume: 'asc', chapter: 'asc' },
      includes: ['scanlation_group'],
      ...params,
    },
  });
  return { data: res.data, total: res.total ?? 0 };
}

export async function getMangaAggregate(
  mangaId: string,
  lang = 'en'
): Promise<ChapterAggregate> {
  return request<ChapterAggregate>(`/manga/${mangaId}/aggregate`, {
    params: { translatedLanguage: [lang] },
  });
}

export async function getChapter(chapterId: string): Promise<Chapter> {
  const res = await request<ApiResponse<Chapter>>(`/chapter/${chapterId}`, {
    params: { includes: ['manga', 'scanlation_group'] },
  });
  return res.data;
}

export async function getAtHomeServer(chapterId: string): Promise<AtHomeServer> {
  return request<AtHomeServer>(`/at-home/server/${chapterId}`);
}

export function getPageUrls(server: AtHomeServer, dataSaver = false): string[] {
  const quality = dataSaver ? 'data-saver' : 'data';
  const pages = dataSaver ? server.chapter.dataSaver : server.chapter.data;
  return pages.map((p) => `${server.baseUrl}/${quality}/${server.chapter.hash}/${p}`);
}

// ── User follows ──────────────────────────────────────────────────────────────

export async function getFollowedManga(limit = 100, offset = 0): Promise<{ data: MangaWithCover[]; total: number }> {
  if (!accessToken) return { data: [], total: 0 };
  const res = await request<ApiResponse<Manga[]>>('/user/follows/manga', {
    params: { limit, offset, includes: ['cover_art'] },
  });
  return { data: res.data.map(enrichManga), total: res.total ?? 0 };
}

export async function getAllFollowedManga(): Promise<MangaWithCover[]> {
  if (!accessToken) return [];
  const pageSize = 100;
  const first = await getFollowedManga(pageSize, 0);
  const results = [...first.data];
  const pages = Math.ceil(first.total / pageSize);
  for (let i = 1; i < pages; i++) {
    const page = await getFollowedManga(pageSize, i * pageSize);
    results.push(...page.data);
  }
  return results;
}

export async function getAllReadingStatuses(): Promise<Record<string, string>> {
  if (!accessToken) return {};
  const res = await request<{ result: string; statuses: Record<string, string> }>('/manga/status');
  return res.statuses ?? {};
}

export async function followManga(mangaId: string): Promise<void> {
  await request(`/manga/${mangaId}/follow`, { method: 'POST' });
}

export async function unfollowManga(mangaId: string): Promise<void> {
  await request(`/manga/${mangaId}/follow`, { method: 'DELETE' });
}

export async function getMangaReadingStatus(mangaId: string): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const res = await request<{ result: string; status: string }>(`/manga/${mangaId}/status`);
    return res.status;
  } catch {
    return null;
  }
}

export async function setMangaReadingStatus(
  mangaId: string,
  status: string | null
): Promise<void> {
  await request(`/manga/${mangaId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export async function getReadChapters(mangaId: string): Promise<string[]> {
  if (!accessToken) return [];
  try {
    const res = await request<{ result: string; data: string[] }>(
      `/manga/${mangaId}/read`
    );
    return res.data;
  } catch {
    return [];
  }
}

export async function markChaptersRead(mangaId: string, chapterIds: string[]): Promise<void> {
  if (!accessToken) return;
  await request(`/manga/${mangaId}/read`, {
    method: 'POST',
    body: JSON.stringify({ chapterIdsRead: chapterIds }),
  });
}

export async function getMangaBatch(ids: string[]): Promise<MangaWithCover[]> {
  if (ids.length === 0) return [];
  const res = await request<ApiResponse<Manga[]>>('/manga', {
    params: { ids, limit: Math.min(ids.length, 100) },
  });
  return res.data.map(enrichManga);
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function getTags(): Promise<import('./types').Tag[]> {
  const res = await request<ApiResponse<import('./types').Tag[]>>('/manga/tag');
  return res.data;
}

// ── Covers ────────────────────────────────────────────────────────────────────

export function getCoverUrl(mangaId: string, fileName: string, size?: 256 | 512): string {
  const suffix = size ? `.${size}.jpg` : '';
  return `${COVER_BASE}/${mangaId}/${fileName}${suffix}`;
}

/** Returns a map of volume number (string) → cover URL for a manga. */
export async function getMangaVolumeCoverUrls(mangaId: string): Promise<Map<string, string>> {
  const res = await request<ApiResponse<Array<{ attributes: { volume: string | null; fileName: string } }>>>(
    '/cover',
    { params: { 'manga[]': mangaId, limit: 100, order: { volume: 'asc' } } }
  );
  const map = new Map<string, string>();
  for (const cover of res.data) {
    const vol = cover.attributes.volume;
    if (vol != null) {
      map.set(vol, getCoverUrl(mangaId, cover.attributes.fileName));
    }
  }
  return map;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function enrichManga(manga: Manga): MangaWithCover {
  const coverRel = manga.relationships.find((r) => r.type === 'cover_art');
  const authorRel = manga.relationships.find((r) => r.type === 'author');
  const artistRel = manga.relationships.find((r) => r.type === 'artist');

  let coverUrl: string | undefined;
  if (coverRel?.attributes) {
    const attrs = coverRel.attributes as { fileName: string };
    coverUrl = getCoverUrl(manga.id, attrs.fileName, 256);
  }

  const authorAttr = authorRel?.attributes as { name?: string } | undefined;
  const artistAttr = artistRel?.attributes as { name?: string } | undefined;
  const authorName = authorAttr?.name ?? artistAttr?.name;

  return { ...manga, coverUrl, authorName };
}

export function getMangaTitle(manga: Manga, preferLang = 'en'): string {
  const { title, altTitles } = manga.attributes;

  // Helper: find a locale in the altTitles array
  const fromAlt = (lang: string): string | undefined => {
    for (const alt of altTitles) {
      if (alt[lang]) return alt[lang];
    }
    return undefined;
  };

  return (
    title[preferLang] ||
    fromAlt(preferLang) ||
    title['en'] ||
    fromAlt('en') ||
    title['ja-ro'] ||
    fromAlt('ja-ro') ||
    title['ja'] ||
    fromAlt('ja') ||
    Object.values(title)[0] ||
    'Unknown Title'
  );
}

export function getMangaDescription(manga: Manga, preferLang = 'en'): string {
  const { description } = manga.attributes;
  return (
    description[preferLang] ||
    description['en'] ||
    Object.values(description)[0] ||
    ''
  );
}

export function getContentRatingColor(rating: string): string {
  switch (rating) {
    case 'safe': return 'text-green';
    case 'suggestive': return 'text-yellow';
    case 'erotica': return 'text-red';
    default: return 'text-text-muted';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ongoing': return 'text-green';
    case 'completed': return 'text-blue';
    case 'hiatus': return 'text-yellow';
    case 'cancelled': return 'text-red';
    default: return 'text-text-muted';
  }
}
