import JSZip from 'jszip';
import { readDir, readFile, writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { getMangaTitle, getMangaDescription, getAtHomeServer } from '$lib/api/mangadex';
import { fetchImage } from '$lib/api/images';
import type { MangaWithCover, Chapter } from '$lib/api/types';
import {
  buildMimetype,
  buildContainerXml,
  buildStyleCss,
  buildCoverXhtml,
  buildContentOpf,
  buildNavXhtml,
  buildTocNcx,
  buildPageXhtml,
  type ChapterManifestItem,
  type PageItem,
} from './templates';

export interface EpubExportOptions {
  manga: MangaWithCover;
  selectedChapters: Chapter[];
  /** Override the epub title (e.g. "My Manga Vol.3 Part 1") */
  volumeTitle?: string;
  /** Series position used for calibre:series_index so readers like Kavita group correctly */
  seriesIndex?: number;
  /** Pre-fetched cover bytes for this volume; pass null to skip cover */
  volumeCoverBytes?: Uint8Array | null;
  /** Absolute path the .epub is written to */
  outPath: string;
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
    const bytes = await fetchImage(url);
    pages.push({ name: filename, bytes });
    onPageProgress?.(i + 1, filenames.length);
  }
  return pages;
}

export async function buildEpub(opts: EpubExportOptions): Promise<void> {
  const { manga, onProgress } = opts;

  const sorted = [...opts.selectedChapters].sort((a, b) => sortKey(a) - sortKey(b));

  const seriesTitle = getMangaTitle(manga); // always the base series name
  const title = opts.volumeTitle ?? seriesTitle;
  const seriesIndex = opts.seriesIndex ?? 1;
  const author = manga.authorName || 'Unknown';
  const description = getMangaDescription(manga);
  const language = 'en';
  const year = manga.attributes.year;
  const tags = manga.attributes.tags
    .map((t) => Object.values(t.attributes.name)[0])
    .filter(Boolean) as string[];

  let coverBytes: Uint8Array | null = null;

  if ('volumeCoverBytes' in opts) {
    // Caller already fetched (or decided to skip) the cover
    coverBytes = opts.volumeCoverBytes ?? null;
  } else {
    onProgress?.('Fetching cover image…', 0);
    if (manga.coverUrl) {
      try {
        coverBytes = await fetchImage(manga.coverUrl);
      } catch {
        // offline — export without cover
      }
    }
  }

  const manifestItems: ChapterManifestItem[] = [];
  const total = sorted.length;

  // Build the zip incrementally — images are added chapter-by-chapter so we
  // never hold all page bytes in a separate map AND in JSZip at the same time.
  const zip = new JSZip();

  // mimetype MUST be first and MUST be uncompressed
  zip.file('mimetype', buildMimetype(), { compression: 'STORE' });

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
      const xhtmlId = `page_ch${chIdx}_${pgIdx}`;
      const xhtmlPath = `chapters/ch${chIdx}_${pgIdx}.xhtml`;

      // Add image immediately with STORE — images are already compressed
      // (JPEG/PNG/WebP), re-deflating wastes memory with negligible size gain.
      zip.file(`OEBPS/${imagePath}`, bytes, { compression: 'STORE' });

      pages.push({ imageId, imagePath, mimeType: mime, xhtmlId, xhtmlPath });
    }

    // rawPages can now be GC'd — we passed the bytes to JSZip above
    rawPages = null;

    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi];
      zip.file(
        `OEBPS/${p.xhtmlPath}`,
        buildPageXhtml({ chapterLabel: label, page: p, pageNum: pi + 1 })
      );
    }

    manifestItems.push({
      xhtmlId: `page_ch${chIdx}_000`,
      xhtmlPath: pages.length > 0 ? pages[0].xhtmlPath : `chapters/ch${chIdx}_000.xhtml`,
      label,
      pages,
    });
  }

  onProgress?.('Assembling EPUB…', 82);

  zip.file('META-INF/container.xml', buildContainerXml());
  zip.file('OEBPS/css/style.css', buildStyleCss());

  const navChapters = manifestItems.map((ch) => ({ xhtmlPath: ch.xhtmlPath, label: ch.label }));

  zip.file('OEBPS/nav.xhtml', buildNavXhtml({ title, chapters: navChapters }));
  zip.file('OEBPS/toc.ncx', buildTocNcx({ mangaId: manga.id, title, chapters: navChapters }));

  const hasCover = coverBytes !== null;
  if (hasCover && coverBytes) {
    zip.file('OEBPS/cover.xhtml', buildCoverXhtml(title));
    zip.file('OEBPS/images/cover.jpg', coverBytes, { compression: 'STORE' });
  }

  zip.file(
    'OEBPS/content.opf',
    buildContentOpf({ mangaId: manga.id, title, seriesTitle, seriesIndex, author, description, language, year, tags, chapters: manifestItems, hasCover })
  );

  onProgress?.('Writing file…', 90);

  await writeZipToFile(zip, opts.outPath, (percent) => {
    onProgress?.('Writing file…', Math.round(90 + percent * 0.1));
  });

  onProgress?.('Done', 100);
}

/** Bytes buffered before each append to disk. */
const WRITE_CHUNK_BYTES = 16 * 1024 * 1024;

/**
 * Stream the zip to disk in chunks instead of generating one buffer.
 *
 * A volume can be several hundred MB. Generating it whole doubles peak memory
 * (JSZip's copy of the images plus the output buffer), and handing that buffer
 * to a single `writeFile` IPC call can stall forever on Windows — the export
 * sits at "Done" and the file never lands.
 */
async function writeZipToFile(
  zip: JSZip,
  path: string,
  onPercent: (percent: number) => void
): Promise<void> {
  // Truncate (or create) first; every chunk after this is appended.
  await writeFile(path, new Uint8Array(0));

  await new Promise<void>((resolve, reject) => {
    let parts: Uint8Array[] = [];
    let size = 0;
    let failed = false;
    // Appends run one at a time, in order.
    let writes: Promise<void> = Promise.resolve();

    const takeBuffer = (): Uint8Array => {
      const buf = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        buf.set(part, offset);
        offset += part.length;
      }
      parts = [];
      size = 0;
      return buf;
    };

    const fail = (e: unknown) => {
      if (failed) return;
      failed = true;
      stream.pause();
      reject(e);
    };

    // Only text files (XHTML, XML, CSS) get DEFLATE — images are added with
    // STORE above, since they are already compressed.
    const stream = zip.generateInternalStream({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    stream.on('data', (chunk, meta) => {
      parts.push(chunk);
      size += chunk.length;
      onPercent(meta.percent);
      if (size < WRITE_CHUNK_BYTES) return;

      stream.pause();
      const buf = takeBuffer();
      writes = writes.then(() => writeFile(path, buf, { append: true }));
      writes.then(() => !failed && stream.resume(), fail);
    });

    stream.on('error', fail);

    stream.on('end', () => {
      const buf = takeBuffer();
      writes = writes.then(() => writeFile(path, buf, { append: true }));
      writes.then(() => !failed && resolve(), fail);
    });

    stream.resume();
  });
}
