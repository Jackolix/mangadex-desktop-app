<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { getAtHomeServer, getPageUrls, getChapter, getMangaChapters } from '$lib/api/mangadex';
  import { exists, readDir, readFile, BaseDirectory } from '@tauri-apps/plugin-fs';
  import { library } from '$lib/stores/library.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { clamp } from '$lib/utils';
  import { onDestroy } from 'svelte';

  const mangaId = $derived(page.params.id!);
  const chapterId = $derived(page.params.chapterId!);

  let pages = $state<string[]>([]);
  let currentPage = $state(0);
  let loading = $state(true);
  let showControls = $state(true);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
  let isOffline = $state(false);
  let allChapters = $state<string[]>([]);
  let currentChapterIndex = $state(-1);

  $effect(() => {
    const cid = chapterId;
    const mid = mangaId;
    loading = true;
    currentPage = 0;

    loadReader(mid, cid);
  });

  async function loadReader(mid: string, cid: string) {
    try {
      // Check if downloaded
      const dir = `downloads/${mid}/${cid}`;
      const dirExists = await exists(dir, { baseDir: BaseDirectory.AppData });
      const dirEntries = dirExists ? await readDir(dir, { baseDir: BaseDirectory.AppData }) : [];
      const downloaded = dirEntries.some((e) => !e.isDirectory);

      if (downloaded) {
        const sorted = dirEntries
          .filter((e) => !e.isDirectory)
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        pages = await Promise.all(
          sorted.map(async (entry) => {
            const bytes = await readFile(`${dir}/${entry.name}`, { baseDir: BaseDirectory.AppData });
            const ext = (entry.name ?? 'jpg').split('.').pop()?.toLowerCase() ?? 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            return URL.createObjectURL(new Blob([bytes], { type: mime }));
          })
        );
        isOffline = true;
      } else {
        const server = await getAtHomeServer(cid);
        pages = getPageUrls(server, settingsStore.value.dataSaver);
        isOffline = false;
      }

      // Load chapter list for navigation
      const { data } = await getMangaChapters(mid, {
        limit: 500,
        translatedLanguage: ['en'],
        order: { volume: 'asc', chapter: 'asc' },
      });
      allChapters = data.map((c) => c.id);
      currentChapterIndex = allChapters.indexOf(cid);

      // Restore progress
      const progress = library.getChapterProgress(mid, cid);
      if (progress && !progress.completed) {
        currentPage = progress.page;
      }
    } catch (e) {
      console.error('Failed to load chapter:', e);
    } finally {
      loading = false;
    }
  }

  async function saveProgress(completed = false) {
    await library.saveProgress(mangaId, chapterId, currentPage, completed);
  }

  function goToPage(n: number) {
    currentPage = clamp(n, 0, pages.length - 1);
    if (currentPage === pages.length - 1) {
      saveProgress(true);
    } else {
      saveProgress(false);
    }
  }

  function nextPage() {
    if (currentPage < pages.length - 1) {
      goToPage(currentPage + 1);
    } else {
      nextChapter();
    }
  }

  function prevPage() {
    if (currentPage > 0) {
      goToPage(currentPage - 1);
    } else {
      prevChapter();
    }
  }

  function nextChapter() {
    if (currentChapterIndex < allChapters.length - 1) {
      goto(`/manga/${mangaId}/read/${allChapters[currentChapterIndex + 1]}`);
    }
  }

  function prevChapter() {
    if (currentChapterIndex > 0) {
      goto(`/manga/${mangaId}/read/${allChapters[currentChapterIndex - 1]}`);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === '0') { e.preventDefault(); resetZoom(); return; }
    if (zoom > 1) return; // Arrow keys pan when zoomed — let browser handle
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
        e.preventDefault();
        nextPage();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        prevPage();
        break;
      case 'Escape':
        goto(`/manga/${mangaId}`);
        break;
    }
  }

  function handleMouseMove() {
    showControls = true;
    if (controlsTimeout) clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => (showControls = false), 3000);
  }

  onDestroy(() => {
    if (controlsTimeout) clearTimeout(controlsTimeout);
    if (isOffline) pages.forEach((url) => URL.revokeObjectURL(url));
  });

  const isLongStrip = $derived(settingsStore.value.readerMode === 'longstrip');
  const progress = $derived(pages.length > 0 ? ((currentPage + 1) / pages.length) * 100 : 0);

  // ── Zoom & pan ────────────────────────────────────────────────────────────
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.15;

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let panLastX = 0;
  let panLastY = 0;
  let hasDragged = false;

  let readerContainerEl = $state<HTMLDivElement | null>(null);

  function resetZoom() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  // Reset zoom when page changes
  $effect(() => {
    currentPage;
    resetZoom();
  });

  // Non-passive wheel listener so we can preventDefault for Ctrl+scroll
  $effect(() => {
    const el = readerContainerEl;
    if (!el || isLongStrip) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? (1 + ZOOM_STEP) : 1 / (1 + ZOOM_STEP);
      const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const delta = newZoom / zoom;

      panX = mx * (1 - delta) + panX * delta;
      panY = my * (1 - delta) + panY * delta;
      zoom = newZoom;

      if (newZoom === MIN_ZOOM) { panX = 0; panY = 0; }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  function handlePanStart(e: MouseEvent) {
    if (zoom <= 1) return;
    isPanning = true;
    hasDragged = false;
    panLastX = e.clientX;
    panLastY = e.clientY;
  }

  function handlePanMove(e: MouseEvent) {
    if (!isPanning) return;
    const dx = e.clientX - panLastX;
    const dy = e.clientY - panLastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDragged = true;
    panX += dx;
    panY += dy;
    panLastX = e.clientX;
    panLastY = e.clientY;
  }

  function handlePanEnd() {
    isPanning = false;
  }

  function handlePageClick(e: MouseEvent) {
    if (zoom > 1 || hasDragged) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.33) prevPage();
    else if (x > rect.width * 0.67) nextPage();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Full-screen reader -->
<div
  class="relative w-full h-screen bg-black overflow-hidden flex flex-col"
  onmousemove={handleMouseMove}
  role="presentation"
>
  <!-- Page info at top (non-interactive, can stay at top) -->
  <div
    class="absolute top-2 left-0 right-0 z-40 flex items-center justify-center gap-3 pointer-events-none transition-opacity duration-300"
    class:opacity-0={!showControls}
  >
    <span class="text-white text-sm bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
      Page {currentPage + 1} / {pages.length}
    </span>
    {#if zoom > 1}
      <button
        onclick={resetZoom}
        class="text-xs text-[var(--color-accent)] bg-[var(--color-accent-muted)] px-2 py-0.5 rounded-full hover:bg-[var(--color-accent)] hover:text-white transition-colors pointer-events-auto"
        title="Reset zoom (Ctrl+0)"
      >
        {Math.round(zoom * 100)}%
      </button>
    {/if}
    {#if isOffline}
      <span class="text-xs text-[var(--color-green)] bg-[var(--color-green-muted)] px-2 py-1 rounded-full">Offline</span>
    {/if}
  </div>

  <!-- Control bar (interactive buttons below drag area) -->
  <div
    class="absolute top-8 left-0 right-0 z-50 flex items-center gap-4 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300"
    class:opacity-0={!showControls}
    class:pointer-events-none={!showControls}
  >
    <button
      onclick={() => goto(`/manga/${mangaId}`)}
      class="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
      Back
    </button>

    <div class="flex-1"></div>

    <!-- Chapter nav -->
    <div class="flex items-center gap-1">
      <button
        onclick={prevChapter}
        disabled={currentChapterIndex <= 0}
        class="px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-30 transition-colors"
      >
        Prev Ch.
      </button>
      <button
        onclick={nextChapter}
        disabled={currentChapterIndex >= allChapters.length - 1}
        class="px-2 py-1 text-xs text-white/70 hover:text-white disabled:opacity-30 transition-colors"
      >
        Next Ch.
      </button>
    </div>
  </div>

  <!-- Progress bar -->
  <div class="absolute top-0 left-0 right-0 h-0.5 bg-white/10 z-50">
    <div class="h-full bg-[var(--color-accent)] transition-all duration-200" style="width: {progress}%" />
  </div>

  <!-- Pages -->
  {#if loading}
    <div class="flex-1 min-h-0 flex items-center justify-center">
      <Spinner size={40} />
    </div>
  {:else if isLongStrip}
    <!-- Long strip mode -->
    <div class="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-1 px-4 py-14">
      {#each pages as pageUrl, i}
        <img
          src={pageUrl}
          alt="Page {i + 1}"
          class="max-w-full w-auto"
          loading={Math.abs(i - currentPage) <= 2 ? 'eager' : 'lazy'}
        />
      {/each}
    </div>
  {:else}
    <!-- Paginated mode -->
    <div
      bind:this={readerContainerEl}
      class="flex-1 min-h-0 relative overflow-hidden {isPanning ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-pointer'}"
      onclick={handlePageClick}
      onmousedown={handlePanStart}
      onmousemove={handlePanMove}
      onmouseup={handlePanEnd}
      onmouseleave={handlePanEnd}
      role="button"
      tabindex="0"
      onkeydown={() => {}}
    >
      <!-- Zoom/pan wrapper — transform-origin: 0 0 so cursor-centered zoom math works -->
      <div
        class="absolute inset-0 flex items-center justify-center"
        style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0; will-change: transform;"
      >
        {#if pages[currentPage]}
          <img
            src={pages[currentPage]}
            alt="Page {currentPage + 1}"
            class="select-none"
            style="max-height: 100%; max-width: 100%; object-fit: contain; display: block;"
            draggable="false"
          />
        {/if}
      </div>

      <!-- Prev/next tap zones — hidden when zoomed in -->
      {#if zoom <= 1}
        <div class="absolute left-0 top-0 w-1/3 h-full opacity-0 hover:opacity-100 flex items-center justify-start pl-4 transition-opacity pointer-events-none">
          <div class="bg-black/30 rounded-full p-2">
            <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </div>
        </div>
        <div class="absolute right-0 top-0 w-1/3 h-full opacity-0 hover:opacity-100 flex items-center justify-end pr-4 transition-opacity pointer-events-none">
          <div class="bg-black/30 rounded-full p-2">
            <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Bottom bar -->
  <div
    class="absolute bottom-0 left-0 right-0 z-50 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300"
    class:opacity-0={!showControls}
    class:pointer-events-none={!showControls}
  >
    <input
      type="range"
      min="0"
      max={pages.length - 1}
      value={currentPage}
      oninput={(e) => goToPage(Number((e.target as HTMLInputElement).value))}
      class="w-full h-1 accent-[var(--color-accent)] cursor-pointer"
    />
    <div class="flex justify-between text-white/50 text-xs mt-1">
      <span>1</span>
      <span>{pages.length}</span>
    </div>
  </div>
</div>
