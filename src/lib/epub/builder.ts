import JSZip from 'jszip';
import { readDir, readFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getMangaTitle, getMangaDescription, getAtHomeServer } from '$lib/api/mangadex';
import type { MangaWithCover, Chapter } from '$lib/api/types';
import {
  buildMimetype,
  buildContainerXml,
  buildStyleCss,
  buildCoverXhtml,
  buildContentOpf,
  buildNavXhtml,
  buildTocNcx,
  buildChapterXhtml,
  type ChapterManifestItem,
  type PageItem,
} from './templates';

export interface EpubExportOptions {
  manga: MangaWithCover;
  selectedChapters: Chapter[];
  /** Override the epub title (e.g. "My Manga Vol.3") */
  volumeTitle?: string;
  /** Pre-fetched cover bytes for this volume; pass null to skip cover */
  volumeCoverBytes?: ArrayBuffer | null;
  onProgress?: (step: string, pct: number) => void;
}

function sortKey(ch: Chapter): number {
  const vol = parseFloat(ch.attributes.volume ?? '0') || 0;
  const num = parseFloat(ch.attributes.chapter ?? '0') || 0;
  return vol * 100000 + num;
}

function chapterLabel(ch: Chapter): string {
  const { volume, chapter, title } = ch.attributes;
  const parts: string[] = [];
  if (volume) parts.push(`Vol.${volume}`);
  if (chapter) parts.push(`Ch.${chapter}`);
  if (title && !title.startsWith('Vol.') && !title.startsWith('Ch.')) {
    parts.push(title);
  }
  return parts.join(' ') || 'Oneshot';
}

function mimeForFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/** Try to load chapter pages from local disk. Returns null if not available. */
async function loadLocalPages(
  mangaId: string,
  chapterId: string
): Promise<Array<{ name: string; bytes: Uint8Array }> | null> {
  const dir = `downloads/${mangaId}/${chapterId}`;
  try {
    const entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
    const files = entries
      .filter((e) => !e.isDirectory)
      .map((e) => e.name)
      .filter(Boolean)
      .sort((a, b) => a!.localeCompare(b!)) as string[];

    if (files.length === 0) return null;

    const pages: Array<{ name: string; bytes: Uint8Array }> = [];
    for (const name of files) {
      const bytes = await readFile(`${dir}/${name}`, { baseDir: BaseDirectory.AppData });
      pages.push({ name, bytes });
    }
    return pages;
  } catch {
    return null;
  }
}

/** Fetch chapter pages from the MangaDex CDN. */
async function fetchRemotePages(
  chapterId: string,
  onPageProgress?: (fetched: number, total: number) => void
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const server = await getAtHomeServer(chapterId);
  const useDataSaver = server.chapter.data.length === 0;
  const filenames = useDataSaver ? server.chapter.dataSaver : server.chapter.data;
  const quality = useDataSaver ? 'data-saver' : 'data';

  if (filenames.length === 0) throw new Error('Chapter has no pages');

  const pages: Array<{ name: string; bytes: Uint8Array }> = [];
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];
    const url = `${server.baseUrl}/${quality}/${server.chapter.hash}/${filename}`;
    const resp = await tauriFetch(url);
    if (!resp.ok) throw new Error(`Page ${i + 1} fetch failed: HTTP ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    pages.push({ name: filename, bytes });
    onPageProgress?.(i + 1, filenames.length);
  }
  return pages;
}

export async function buildEpub(opts: EpubExportOptions): Promise<Uint8Array> {
  const { manga, onProgress } = opts;

  const sorted = [...opts.selectedChapters].sort((a, b) => sortKey(a) - sortKey(b));

  const title = opts.volumeTitle ?? getMangaTitle(manga);
  const author = manga.authorName || 'Unknown';
  const description = getMangaDescription(manga);
  const language = 'en';
  const year = manga.attributes.year;
  const tags = manga.attributes.tags
    .map((t) => Object.values(t.attributes.name)[0])
    .filter(Boolean) as string[];

  let coverBytes: ArrayBuffer | null = null;

  if ('volumeCoverBytes' in opts) {
    // Caller already fetched (or decided to skip) the cover
    coverBytes = opts.volumeCoverBytes ?? null;
  } else {
    onProgress?.('Fetching cover image…', 0);
    if (manga.coverUrl) {
      try {
        const res = await fetch(manga.coverUrl);
        if (res.ok) coverBytes = await res.arrayBuffer();
      } catch {
        // offline — export without cover
      }
    }
  }

  const manifestItems: ChapterManifestItem[] = [];
  const pageDataMap = new Map<string, Uint8Array>();
  const total = sorted.length;

  for (let i = 0; i < sorted.length; i++) {
    const chapter = sorted[i];
    const chIdx = String(i + 1).padStart(3, '0');
    const label = chapterLabel(chapter);
    const pct = Math.round(5 + (i / total) * 75);

    onProgress?.(`Chapter ${i + 1}/${total}: ${label}`, pct);

    // Try local first, fall back to remote
    let rawPages: Array<{ name: string; bytes: Uint8Array }> | null =
      await loadLocalPages(manga.id, chapter.id);

    if (!rawPages) {
      onProgress?.(`Fetching ${label} from MangaDex…`, pct);
      try {
        rawPages = await fetchRemotePages(chapter.id, (fetched, pageTotal) => {
          const subPct = Math.round(pct + ((fetched / pageTotal) * 75) / total);
          onProgress?.(`${label}: page ${fetched}/${pageTotal}`, subPct);
        });
      } catch (e) {
        console.warn(`[epub] Skipping chapter ${chapter.id}:`, e);
        continue;
      }
    }

    if (!rawPages || rawPages.length === 0) continue;

    const pages: PageItem[] = [];
    for (let j = 0; j < rawPages.length; j++) {
      const { name, bytes } = rawPages[j];
      const pgIdx = String(j).padStart(3, '0');
      const mime = mimeForFilename(name);
      const ext = extForMime(mime);
      const imageId = `img_ch${chIdx}_${pgIdx}`;
      const imagePath = `chapters/images/ch${chIdx}_${pgIdx}.${ext}`;

      pageDataMap.set(imageId, bytes);
      pages.push({ imageId, imagePath, mimeType: mime });
    }

    manifestItems.push({
      xhtmlId: `ch_${chIdx}`,
      xhtmlPath: `chapters/ch_${chIdx}.xhtml`,
      label,
      pages,
    });
  }

  onProgress?.('Assembling EPUB…', 82);

  const zip = new JSZip();

  // mimetype MUST be first and MUST be uncompressed
  zip.file('mimetype', buildMimetype(), { compression: 'STORE' });
  zip.file('META-INF/container.xml', buildContainerXml());
  zip.file('OEBPS/css/style.css', buildStyleCss());

  const navChapters = manifestItems.map((ch) => ({ xhtmlPath: ch.xhtmlPath, label: ch.label }));

  zip.file('OEBPS/nav.xhtml', buildNavXhtml({ title, chapters: navChapters }));
  zip.file('OEBPS/toc.ncx', buildTocNcx({ mangaId: manga.id, title, chapters: navChapters }));

  const hasCover = coverBytes !== null;
  if (hasCover && coverBytes) {
    zip.file('OEBPS/cover.xhtml', buildCoverXhtml(title));
    zip.file('OEBPS/images/cover.jpg', coverBytes);
  }

  zip.file(
    'OEBPS/content.opf',
    buildContentOpf({ mangaId: manga.id, title, author, description, language, year, tags, chapters: manifestItems, hasCover })
  );

  for (const ch of manifestItems) {
    zip.file(`OEBPS/${ch.xhtmlPath}`, buildChapterXhtml({ chapterLabel: ch.label, pages: ch.pages }));
    for (const p of ch.pages) {
      const bytes = pageDataMap.get(p.imageId);
      if (bytes) zip.file(`OEBPS/${p.imagePath}`, bytes);
    }
  }

  onProgress?.('Compressing…', 90);

  const result = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  onProgress?.('Done', 100);
  return result;
}
