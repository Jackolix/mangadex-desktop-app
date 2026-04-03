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
const COVER_BASE = 'https://uploads.mangadex.org/covers';

// Token storage
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(session: string, refresh: string) {
  accessToken = session;
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

  const response = await fetch(url, { ...fetchOptions, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ result: 'error' }));
    throw new Error(
      error?.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (res.token) {
    setTokens(res.token.session, res.token.refresh);
  }
  return res;
}

export async function refreshSession(): Promise<AuthResponse> {
  if (!refreshToken) throw new Error('No refresh token');
  const res = await request<AuthResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ token: refreshToken }),
  });
  if (res.token) {
    setTokens(res.token.session, res.token.refresh);
  }
  return res;
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' }).catch(() => {});
  clearTokens();
}

export async function getMe(): Promise<User> {
  const res = await request<ApiResponse<User>>('/auth/me');
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

export async function getFollowedManga(limit = 100): Promise<MangaWithCover[]> {
  if (!accessToken) return [];
  const res = await request<ApiResponse<Manga[]>>('/user/follows/manga', {
    params: { limit, includes: ['cover_art'] },
  });
  return res.data.map(enrichManga);
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
  const { title } = manga.attributes;
  return (
    title[preferLang] ||
    title['en'] ||
    title['ja-ro'] ||
    title['ja'] ||
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
