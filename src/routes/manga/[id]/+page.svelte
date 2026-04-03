<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import ChapterItem from '$lib/components/ChapterItem.svelte';
  import { getManga, getMangaChapters, getMangaTitle, getMangaDescription, getStatusColor, getContentRatingColor } from '$lib/api/mangadex';
  import type { Chapter, MangaWithCover } from '$lib/api/types';
  import { library } from '$lib/stores/library.svelte';
  import { toast } from 'svelte-sonner';
  import { formatDate } from '$lib/utils';

  const mangaId = $derived(page.params.id!);

  let manga = $state<MangaWithCover | null>(null);
  let chapters = $state<Chapter[]>([]);
  let readChapterIds = $state<Set<string>>(new Set());
  let loadingManga = $state(true);
  let loadingChapters = $state(true);
  let showAllChapters = $state(false);
  let addingToLibrary = $state(false);

  $effect(() => {
    const id = mangaId;
    loadingManga = true;
    loadingChapters = true;
    manga = null;
    chapters = [];

    getManga(id)
      .then((m) => (manga = m))
      .finally(() => (loadingManga = false));

    getMangaChapters(id, { limit: 500, order: { volume: 'desc', chapter: 'desc' } })
      .then(({ data }) => (chapters = data))
      .finally(() => (loadingChapters = false));

    // Load progress
    library.loadProgress(id).then((progress) => {
      readChapterIds = new Set(progress.filter((p) => p.completed).map((p) => p.chapterId));
    });
  });

  const isInLibrary = $derived(library.isInLibrary(mangaId));
  const title = $derived(manga ? getMangaTitle(manga) : '');
  const description = $derived(manga ? getMangaDescription(manga) : '');
  const displayedChapters = $derived(showAllChapters ? chapters : chapters.slice(0, 30));

  const tags = $derived(manga?.attributes.tags.slice(0, 8) ?? []);
  const authorName = $derived(manga?.authorName ?? '');

  async function toggleLibrary() {
    if (!manga) return;
    addingToLibrary = true;
    try {
      if (isInLibrary) {
        await library.removeFromLibrary(mangaId);
        toast.success('Removed from library');
      } else {
        await library.addToLibrary({
          id: manga.id,
          title: getMangaTitle(manga),
          coverUrl: manga.coverUrl,
          status: 'reading',
          contentRating: manga.attributes.contentRating,
          tags: manga.attributes.tags.map((t) => Object.values(t.attributes.name)[0]).filter(Boolean),
        });
        toast.success('Added to library');
      }
    } finally {
      addingToLibrary = false;
    }
  }

  function getFirstChapter(): Chapter | undefined {
    return chapters[chapters.length - 1];
  }
</script>

<div class="h-full overflow-y-auto">
  {#if loadingManga}
    <div class="flex items-center justify-center h-64">
      <Spinner size={36} />
    </div>
  {:else if manga}
    <!-- Banner -->
    <div class="relative h-52 overflow-hidden">
      {#if manga.coverUrl}
        <img src={manga.coverUrl} alt="" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-20" />
      {/if}
      <div class="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--color-bg-base)]" />
    </div>

    <!-- Content -->
    <div class="relative -mt-24 px-8 pb-8">
      <div class="flex gap-6">
        <!-- Cover -->
        <div class="flex-shrink-0 w-36 h-52 rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-lg)] bg-[var(--color-bg-overlay)]">
          {#if manga.coverUrl}
            <img src={manga.coverUrl} alt={title} class="w-full h-full object-cover" />
          {/if}
        </div>

        <!-- Info -->
        <div class="flex flex-col gap-3 pt-16 min-w-0">
          <h1 class="text-xl font-bold text-[var(--color-text-primary)] leading-tight">{title}</h1>
          {#if authorName}
            <p class="text-sm text-[var(--color-text-muted)]">by {authorName}</p>
          {/if}

          <div class="flex flex-wrap gap-2">
            <Badge variant={manga.attributes.status === 'ongoing' ? 'green' : manga.attributes.status === 'completed' ? 'blue' : 'yellow'}>
              {manga.attributes.status}
            </Badge>
            {#if manga.attributes.contentRating !== 'safe'}
              <Badge variant={manga.attributes.contentRating === 'suggestive' ? 'yellow' : 'red'}>
                {manga.attributes.contentRating}
              </Badge>
            {/if}
            {#if manga.attributes.year}
              <Badge variant="default">{manga.attributes.year}</Badge>
            {/if}
          </div>

          <div class="flex flex-wrap gap-1.5">
            {#each tags as tag}
              <Badge variant="default" size="sm">{Object.values(tag.attributes.name)[0]}</Badge>
            {/each}
          </div>

          <div class="flex gap-2 mt-1">
            {#if chapters.length > 0}
              <Button variant="accent" onclick={() => goto(`/manga/${mangaId}/read/${getFirstChapter()?.id}`)}>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Read First
              </Button>
            {/if}
            <Button variant={isInLibrary ? 'accent' : 'outline'} loading={addingToLibrary} onclick={toggleLibrary}>
              {#if isInLibrary}
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                In Library
              {:else}
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Add to Library
              {/if}
            </Button>
          </div>
        </div>
      </div>

      <!-- Description -->
      {#if description}
        <div class="mt-6">
          <h2 class="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Synopsis</h2>
          <p class="text-sm text-[var(--color-text-secondary)] leading-relaxed">{description.slice(0, 600)}{description.length > 600 ? '...' : ''}</p>
        </div>
      {/if}

      <!-- Chapters -->
      <div class="mt-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Chapters ({chapters.length})
          </h2>
          {#if chapters.length > 0}
            <span class="text-xs text-[var(--color-text-muted)]">
              {readChapterIds.size} read
            </span>
          {/if}
        </div>

        {#if loadingChapters}
          <div class="flex items-center justify-center py-12">
            <Spinner size={28} />
          </div>
        {:else if chapters.length === 0}
          <p class="text-sm text-[var(--color-text-muted)] py-8 text-center">No chapters available</p>
        {:else}
          <div class="flex flex-col gap-0.5">
            {#each displayedChapters as chapter}
              <ChapterItem
                {chapter}
                {mangaId}
                mangaTitle={title}
                isRead={readChapterIds.has(chapter.id)}
              />
            {/each}
          </div>

          {#if chapters.length > 30}
            <button
              onclick={() => (showAllChapters = !showAllChapters)}
              class="w-full py-3 text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors mt-2"
            >
              {showAllChapters ? 'Show Less' : `Show All ${chapters.length} Chapters`}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
