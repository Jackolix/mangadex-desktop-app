<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { getAtHomeServer, getPageUrls, getChapter, getMangaChapters } from '$lib/api/mangadex';
  import { invoke } from '@tauri-apps/api/core';
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
      const downloaded = await invoke<boolean>('is_chapter_downloaded', { mangaId: mid, chapterId: cid });

      if (downloaded) {
        const localPages = await invoke<string[]>('get_chapter_pages', { mangaId: mid, chapterId: cid });
        pages = localPages.map((p) => `asset://localhost/${p.replace(/^\//, '')}`);
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
  });

  const isLongStrip = $derived(settingsStore.value.readerMode === 'longstrip');
  const progress = $derived(pages.length > 0 ? ((currentPage + 1) / pages.length) * 100 : 0);
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Full-screen reader -->
<div
  class="relative w-full h-screen bg-black overflow-hidden flex flex-col"
  onmousemove={handleMouseMove}
  role="presentation"
>
  <!-- Top bar -->
  <div
    class="absolute top-0 left-0 right-0 z-50 flex items-center gap-4 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300"
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

    <div class="flex-1 text-center">
      <span class="text-white/70 text-sm">
        Page {currentPage + 1} / {pages.length}
      </span>
    </div>

    {#if isOffline}
      <span class="text-xs text-[var(--color-green)] bg-[var(--color-green-muted)] px-2 py-1 rounded-full">Offline</span>
    {/if}

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
    <div class="flex-1 flex items-center justify-center">
      <Spinner size={40} />
    </div>
  {:else if isLongStrip}
    <!-- Long strip mode -->
    <div class="flex-1 overflow-y-auto flex flex-col items-center gap-1 px-4 py-14">
      {#each pages as pageUrl, i}
        <img
          src={pageUrl}
          alt="Page {i + 1}"
          class="max-w-full w-auto"
          style="max-height: none"
          loading={Math.abs(i - currentPage) <= 2 ? 'eager' : 'lazy'}
        />
      {/each}
    </div>
  {:else}
    <!-- Paginated mode -->
    <div
      class="flex-1 flex items-center justify-center relative cursor-pointer"
      onclick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width * 0.33) prevPage();
        else if (x > rect.width * 0.67) nextPage();
      }}
      role="button"
      tabindex="0"
      onkeydown={() => {}}
    >
      {#if pages[currentPage]}
        <img
          src={pages[currentPage]}
          alt="Page {currentPage + 1}"
          class="max-w-full max-h-full object-contain select-none"
          draggable="false"
        />
      {/if}

      <!-- Prev/next zones (visual hint on hover) -->
      <div class="absolute left-0 top-0 w-1/3 h-full opacity-0 hover:opacity-100 flex items-center justify-start pl-4 transition-opacity">
        <div class="bg-black/30 rounded-full p-2">
          <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </div>
      </div>
      <div class="absolute right-0 top-0 w-1/3 h-full opacity-0 hover:opacity-100 flex items-center justify-end pr-4 transition-opacity">
        <div class="bg-black/30 rounded-full p-2">
          <svg class="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
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
