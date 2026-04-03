// MangaDex API Types

export type ContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';
export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
export type ReadingStatus = 'reading' | 'on_hold' | 'plan_to_read' | 'dropped' | 're_reading' | 'completed';
export type PublicationDemographic = 'shounen' | 'shoujo' | 'josei' | 'seinen';
export type Locale = string;

export interface LocalizedString {
  [locale: string]: string;
}

export interface Tag {
  id: string;
  type: 'tag';
  attributes: {
    name: LocalizedString;
    description: LocalizedString;
    group: string;
    version: number;
  };
}

export interface Relationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  related?: string;
}

export interface CoverArt {
  id: string;
  type: 'cover_art';
  attributes: {
    description: string;
    volume: string | null;
    fileName: string;
    locale: string;
    createdAt: string;
    updatedAt: string;
    version: number;
  };
}

export interface Author {
  id: string;
  type: 'author' | 'artist';
  attributes: {
    name: string;
    imageUrl: string | null;
    biography: LocalizedString;
    createdAt: string;
    updatedAt: string;
    version: number;
  };
}

export interface Manga {
  id: string;
  type: 'manga';
  attributes: {
    title: LocalizedString;
    altTitles: LocalizedString[];
    description: LocalizedString;
    isLocked: boolean;
    links: Record<string, string>;
    originalLanguage: string;
    lastVolume: string | null;
    lastChapter: string | null;
    publicationDemographic: PublicationDemographic | null;
    status: MangaStatus;
    year: number | null;
    contentRating: ContentRating;
    tags: Tag[];
    state: string;
    chapterNumbersResetOnNewVolume: boolean;
    createdAt: string;
    updatedAt: string;
    version: number;
    availableTranslatedLanguages: string[];
    latestUploadedChapter: string | null;
  };
  relationships: Relationship[];
}

export interface Chapter {
  id: string;
  type: 'chapter';
  attributes: {
    title: string | null;
    volume: string | null;
    chapter: string | null;
    pages: number;
    translatedLanguage: string;
    uploader: string;
    externalUrl: string | null;
    publishAt: string;
    readableAt: string;
    createdAt: string;
    updatedAt: string;
    version: number;
  };
  relationships: Relationship[];
}

export interface ChapterAggregate {
  result: string;
  volumes: {
    [volume: string]: {
      volume: string;
      count: number;
      chapters: {
        [chapter: string]: {
          chapter: string;
          id: string;
          others: string[];
          count: number;
        };
      };
    };
  };
}

export interface AtHomeServer {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

export interface User {
  id: string;
  type: 'user';
  attributes: {
    username: string;
    roles: string[];
    version: number;
  };
}

// API Response wrappers
export interface ApiResponse<T> {
  result: 'ok' | 'error';
  response?: string;
  data: T;
  limit?: number;
  offset?: number;
  total?: number;
}

export interface ApiError {
  result: 'error';
  errors: Array<{
    id: string;
    status: number;
    title: string;
    detail: string;
  }>;
}

// Auth types
export interface AuthTokens {
  session: string;
  refresh: string;
}

export interface AuthResponse {
  result: string;
  token: AuthTokens;
}

// Search params
export interface MangaSearchParams {
  title?: string;
  limit?: number;
  offset?: number;
  authors?: string[];
  artists?: string[];
  year?: number;
  includedTags?: string[];
  excludedTags?: string[];
  status?: MangaStatus[];
  originalLanguage?: string[];
  availableTranslatedLanguage?: string[];
  publicationDemographic?: PublicationDemographic[];
  ids?: string[];
  contentRating?: ContentRating[];
  createdAtSince?: string;
  updatedAtSince?: string;
  order?: {
    title?: 'asc' | 'desc';
    year?: 'asc' | 'desc';
    createdAt?: 'asc' | 'desc';
    updatedAt?: 'asc' | 'desc';
    latestUploadedChapter?: 'asc' | 'desc';
    followedCount?: 'asc' | 'desc';
    relevance?: 'asc' | 'desc';
    rating?: 'asc' | 'desc';
  };
  includes?: string[];
}

export interface ChapterSearchParams {
  limit?: number;
  offset?: number;
  ids?: string[];
  title?: string;
  groups?: string[];
  uploader?: string;
  manga?: string;
  volume?: string | string[];
  chapter?: string | string[];
  translatedLanguage?: string[];
  originalLanguage?: string[];
  excludedOriginalLanguage?: string[];
  contentRating?: ContentRating[];
  order?: {
    createdAt?: 'asc' | 'desc';
    updatedAt?: 'asc' | 'desc';
    publishAt?: 'asc' | 'desc';
    readableAt?: 'asc' | 'desc';
    volume?: 'asc' | 'desc';
    chapter?: 'asc' | 'desc';
  };
  includes?: string[];
}

// Derived/helper types
export interface MangaWithCover extends Manga {
  coverUrl?: string;
  authorName?: string;
}

export interface LibraryEntry {
  id: string;
  title: string;
  coverUrl?: string;
  status: ReadingStatus;
  contentRating: ContentRating;
  tags: string[];
  addedAt: number;
  updatedAt: number;
}

export interface DownloadEntry {
  chapterId: string;
  mangaId: string;
  mangaTitle?: string;
  chapterTitle?: string;
  volume?: string;
  chapterNum?: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  path?: string;
  totalPages: number;
  downloadedPages: number;
  createdAt: number;
  completedAt?: number;
}

export interface ReadingProgress {
  mangaId: string;
  chapterId: string;
  page: number;
  completed: boolean;
  readAt: number;
}
