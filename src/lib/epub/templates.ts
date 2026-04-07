function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildMimetype(): string {
  return 'application/epub+zip';
}

export function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

export function buildStyleCss(): string {
  return `body {
  margin: 0;
  padding: 0;
  background: #000;
}
.chapter-title {
  color: #fff;
  font-family: sans-serif;
  font-size: 1.2em;
  text-align: center;
  padding: 1em;
  margin: 0;
}
.page-container {
  text-align: center;
  page-break-after: always;
}
.chapter-page {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}`;
}

export function buildCoverXhtml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${xmlEscape(title)}</title>
  <style>body{margin:0;padding:0;background:#000;} img{max-width:100%;height:auto;display:block;margin:auto;}</style>
</head>
<body>
  <img src="images/cover.jpg" alt="${xmlEscape(title)} Cover"/>
</body>
</html>`;
}

export interface PageItem {
  imageId: string;
  imagePath: string;
  mimeType: string;
  xhtmlId: string;
  xhtmlPath: string;
}

export interface ChapterManifestItem {
  xhtmlId: string;
  xhtmlPath: string;
  label: string;
  pages: PageItem[];
}

export function buildContentOpf(params: {
  mangaId: string;
  title: string;
  seriesTitle: string;
  seriesIndex: number;
  author: string;
  description: string;
  language: string;
  year: number | null;
  tags: string[];
  chapters: ChapterManifestItem[];
  hasCover: boolean;
}): string {
  const { mangaId, title, seriesTitle, seriesIndex, author, description, language, year, tags, chapters, hasCover } = params;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const tagItems = tags.map((t) => `    <dc:subject>${xmlEscape(t)}</dc:subject>`).join('\n');

  const manifestImages = chapters
    .flatMap((ch) =>
      ch.pages.map(
        (p) => `    <item id="${p.imageId}" href="${p.imagePath}" media-type="${p.mimeType}"/>`
      )
    )
    .join('\n');

  const manifestChapters = chapters
    .flatMap((ch) =>
      ch.pages.map(
        (p) => `    <item id="${p.xhtmlId}" href="${p.xhtmlPath}" media-type="application/xhtml+xml"/>`
      )
    )
    .join('\n');

  const spineItems = chapters
    .flatMap((ch) => ch.pages.map((p) => `    <itemref idref="${p.xhtmlId}"/>`))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"
         unique-identifier="uid" xml:lang="${xmlEscape(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:mangadex:${xmlEscape(mangaId)}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:creator>${xmlEscape(author)}</dc:creator>
    <dc:description>${xmlEscape(description)}</dc:description>
    <dc:publisher>MangaDex</dc:publisher>
    <dc:language>${xmlEscape(language)}</dc:language>
${year ? `    <dc:date>${year}</dc:date>\n` : ''}${tagItems}
    <meta property="dcterms:modified">${now}</meta>
    <meta name="calibre:series" content="${xmlEscape(seriesTitle)}"/>
    <meta name="calibre:series_index" content="${seriesIndex}"/>
    <meta property="belongs-to-collection" id="series">${xmlEscape(seriesTitle)}</meta>
    <meta refines="#series" property="collection-type">series</meta>
    <meta refines="#series" property="group-position">${seriesIndex}</meta>
${hasCover ? '    <meta name="cover" content="cover-image"/>\n' : ''}  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="css/style.css" media-type="text/css"/>
${hasCover ? '    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>\n' : ''}${hasCover ? '    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>\n' : ''}${manifestChapters}
${manifestImages}
  </manifest>
  <spine toc="ncx">
${hasCover ? '    <itemref idref="cover-page"/>\n' : ''}${spineItems}
  </spine>
</package>`;
}

export function buildNavXhtml(params: {
  title: string;
  chapters: Array<{ xhtmlPath: string; label: string }>;
}): string {
  const { title, chapters } = params;
  const items = chapters
    .map((ch) => `      <li><a href="${ch.xhtmlPath}">${xmlEscape(ch.label)}</a></li>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${xmlEscape(title)}</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${xmlEscape(title)}</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`;
}

export function buildTocNcx(params: {
  mangaId: string;
  title: string;
  chapters: Array<{ xhtmlPath: string; label: string }>;
}): string {
  const { mangaId, title, chapters } = params;
  const navPoints = chapters
    .map(
      (ch, i) => `  <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
    <navLabel><text>${xmlEscape(ch.label)}</text></navLabel>
    <content src="${ch.xhtmlPath}"/>
  </navPoint>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:mangadex:${xmlEscape(mangaId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

export function buildPageXhtml(params: { chapterLabel: string; page: PageItem; pageNum: number }): string {
  const { chapterLabel, page, pageNum } = params;
  // imagePath is OEBPS-relative (e.g. "chapters/images/ch001_000.jpg")
  // This XHTML is at OEBPS/chapters/ch001_000.xhtml, so strip the "chapters/" prefix
  const relSrc = page.imagePath.startsWith('chapters/')
    ? page.imagePath.slice('chapters/'.length)
    : page.imagePath;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${xmlEscape(chapterLabel)} - Page ${pageNum}</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css"/>
</head>
<body>
  <div class="page-container">
    <img class="chapter-page" src="${relSrc}" alt="${xmlEscape(chapterLabel)} Page ${pageNum}"/>
  </div>
</body>
</html>`;
}
