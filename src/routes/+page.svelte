<script lang="ts">
  import MangaCard from '$lib/components/MangaCard.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { getFeaturedManga, getRecentlyUpdated, getTopManga, getMangaTitle, getMangaDescription } from '$lib/api/mangadex';
  import type { MangaWithCover } from '$lib/api/types';
  import { library } from '$lib/stores/library.svelte';

  let featured = $state<MangaWithCover[]>([]);
  let recentlyUpdated = $state<MangaWithCover[]>([]);
  let topManga = $state<MangaWithCover[]>([]);
  let loadingFeatured = $state(true);
  let loadingRecent = $state(true);
  let loadingTop = $state(true);
  let currentIndex = $state(0);
  let paused = $state(false);

  $effect(() => {
    getFeaturedManga()
      .then((data) => (featured = data))
      .finally(() => (loadingFeatured = false));
    getRecentlyUpdated(20)
      .then((data) => (recentlyUpdated = data))
      .finally(() => (loadingRecent = false));
    getTopManga(20)
      .then((data) => (topManga = data))
      .finally(() => (loadingTop = false));
  });

  $effect(() => {
    if (featured.length <= 1 || paused) return;
    const id = setInterval(() => {
      currentIndex = (currentIndex + 1) % featured.length;
    }, 5000);
    return () => clearInterval(id);
  });

  function goTo(index: number) {
    currentIndex = index;
  }

  function prev() {
    currentIndex = (currentIndex - 1 + featured.length) % featured.length;
  }

  function next() {
    currentIndex = (currentIndex + 1) % featured.length;
  }
</script>

<div class="h-full overflow-y-auto">
  {#if featured.length > 0}
    <div
      class="relative h-64 overflow-hidden"
      role="region"
      aria-label="Featured manga carousel"
      onmouseenter={() => (paused = true)}
      onmouseleave={() => (paused = false)}
    >
      {#each featured as manga, i}
        <div
          class="absolute inset-0 transition-opacity duration-700"
          style="opacity: {i === currentIndex ? 1 : 0}; pointer-events: {i === currentIndex ? 'auto' : 'none'};"
        >
          {#if manga.coverUrl}
            <img src={manga.coverUrl} alt="" class="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-30" />
          {/if}
          <div class="absolute inset-0 bg-gradient-to-r from-[var(--color-bg-base)] via-[var(--color-bg-base)]/70 to-transparent" />
          <div class="relative h-full flex items-center gap-6 px-8">
            {#if manga.coverUrl}
              <img src={manga.coverUrl} alt="" class="h-44 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] flex-shrink-0 object-cover" style="aspect-ratio: 2/3" />
            {/if}
            <div class="flex flex-col gap-2 min-w-0">
              <span class="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-wider">Featured</span>
              <h1 class="text-2xl font-bold text-[var(--color-text-primary)] leading-tight line-clamp-2">{getMangaTitle(manga)}</h1>
              {#if manga.authorName}
                <p class="text-sm text-[var(--color-text-muted)]">by {manga.authorName}</p>
              {/if}
              <p class="text-sm text-[var(--color-text-secondary)] line-clamp-2 max-w-lg">{getMangaDescription(manga).slice(0, 200)}</p>
              <div class="flex gap-2 mt-1">
                <a href="/manga/{manga.id}" class="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
                  View Manga
                </a>
              </div>
            </div>
          </div>
        </div>
      {/each}

      <!-- Prev / Next arrows -->
      <button
        onclick={prev}
        class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-bg-base)]/60 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-base)]/80 transition-colors z-10"
        aria-label="Previous"
      >
        ‹
      </button>
      <button
        onclick={next}
        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-bg-base)]/60 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-base)]/80 transition-colors z-10"
        aria-label="Next"
      >
        ›
      </button>

      <!-- Dot indicators -->
      <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {#each featured as _, i}
          <button
            onclick={() => goTo(i)}
            class="w-1.5 h-1.5 rounded-full transition-all duration-300 {i === currentIndex ? 'bg-[var(--color-accent)] w-4' : 'bg-[var(--color-text-muted)]/50 hover:bg-[var(--color-text-muted)]'}"
            aria-label="Go to slide {i + 1}"
          />
        {/each}
      </div>
    </div>
  {:else if loadingFeatured}
    <div class="h-64 flex items-center justify-center"><Spinner size={32} /></div>
  {/if}

  <div class="px-8 py-6 flex flex-col gap-8">
    {#if library.entries.length > 0}
      <section>
        <h2 class="text-base font-semibold text-[var(--color-text-primary)] mb-4">Your Library</h2>
        <div class="flex gap-4 overflow-x-auto pb-2">
          {#each library.entries.slice(0, 10) as entry}
            <a href="/manga/{entry.id}" class="flex-shrink-0 group">
              <div class="w-28 h-40 rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-overlay)]">
                {#if entry.coverUrl}
                  <img src={entry.coverUrl} alt={entry.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {/if}
              </div>
              <p class="text-xs text-[var(--color-text-secondary)] mt-1.5 w-28 truncate group-hover:text-[var(--color-accent)] transition-colors">{entry.title}</p>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-[var(--color-text-primary)]">Recently Updated</h2>
        <a href="/browse?sort=latestUploadedChapter" class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors">See all →</a>
      </div>
      {#if loadingRecent}
        <div class="flex gap-4">
          {#each Array(6) as _}
            <div class="w-36 flex flex-col gap-2 flex-shrink-0">
              <div class="w-36 h-52 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] animate-pulse" />
              <div class="h-3 rounded bg-[var(--color-bg-elevated)] animate-pulse w-4/5" />
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex gap-4 overflow-x-auto pb-2">
          {#each recentlyUpdated as manga}
            <div class="flex-shrink-0"><MangaCard {manga} size="md" /></div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="pb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-[var(--color-text-primary)]">Top Rated</h2>
        <a href="/browse?sort=rating" class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors">See all →</a>
      </div>
      {#if loadingTop}
        <div class="flex gap-4">
          {#each Array(6) as _}
            <div class="w-36 flex flex-col gap-2 flex-shrink-0">
              <div class="w-36 h-52 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] animate-pulse" />
              <div class="h-3 rounded bg-[var(--color-bg-elevated)] animate-pulse w-4/5" />
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex gap-4 overflow-x-auto pb-2">
          {#each topManga as manga}
            <div class="flex-shrink-0"><MangaCard {manga} size="md" /></div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
