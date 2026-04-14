<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import ChapterItem from '$lib/components/ChapterItem.svelte';
  import { getManga, getMangaChapters, getMangaTitle, getMangaDescription } from '$lib/api/mangadex';
  import type { Chapter, MangaWithCover } from '$lib/api/types';
  import { library } from '$lib/stores/library.svelte';
  import { downloadsStore } from '$lib/stores/downloads.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import EpubExportModal from '$lib/components/EpubExportModal.svelte';
  import { epubExports } from '$lib/stores/epubExports.svelte';
  import { toast } from 'svelte-sonner';
  import { formatChapter } from '$lib/utils';
  import Select from '$lib/components/ui/Select.svelte';

  const mangaId = $derived(page.params.id!);

  let manga = $state<MangaWithCover | null>(null);
  let chapters = $state<Chapter[]>([]);
  let readChapterIds = $state<Set<string>>(new Set());
  let continueChapterId = $state<string | null>(null);
  let loadingManga = $state(true);
  let loadingChapters = $state(true);
  let addingToLibrary = $state(false);
  let showEpubModal = $state(false);
  let selectionMode = $state(false);
  let selectedIds = $state(new Set<string>());
  let collapsedVolumes = $state(new Set<string>());
  let batchDownloading = $state(false);

  $effect(() => {
    const id = mangaId;
    loadingManga = true;
    loadingChapters = true;
    manga = null;
    chapters = [];
    continueChapterId = null;
    selectionMode = false;
    selectedIds = new Set();
    collapsedVolumes = new Set();

    getManga(id)
      .then((m) => {
        manga = m;
        // If this manga had a "new chapters" badge, clear it now that the user is viewing it
        if (library.hasNewChapters(id) && m.attributes.latestUploadedChapter) {
          library.acknowledgeNewChapters(id, m.attributes.latestUploadedChapter);
        }
      })
      .finally(() => (loadingManga = false));

    getMangaChapters(id, { limit: 500, order: { volume: 'asc', chapter: 'asc' } })
      .then(({ data }) => {
        chapters = data;
        // Resolve continue chapter now that we have both chapters + progress
        resolveContinueChapter(data);
        // Keep total chapter count up-to-date in the library
        if (library.isInLibrary(id)) {
          library.updateChapterCount(id, data.length);
        }
      })
      .finally(() => (loadingChapters = false));

    // Load progress then resolve continue chapter
    library.loadProgress(id).then((progress) => {
      readChapterIds = new Set(progress.filter((p) => p.completed).map((p) => p.chapterId));
      resolveContinueChapter(chapters, progress);
    });
  });

  function resolveContinueChapter(
    chapterList: typeof chapters,
    progress?: import('$lib/api/types').ReadingProgress[]
  ) {
    if (!chapterList.length) return;

    const prog = progress ?? library.getProgressForManga(mangaId);
    if (!prog || !prog.length) return;

    // Find the most recently interacted-with chapter (highest readAt)
    const latest = [...prog].sort((a, b) => b.readAt - a.readAt)[0];

    if (!latest.completed) {
      // Resume the in-progress chapter
      continueChapterId = latest.chapterId;
      return;
    }

    // Last read chapter was completed — find the next unread one
    const lastReadIdx = chapterList.findIndex((c) => c.id === latest.chapterId);
    const completedIds = new Set(prog.filter((p) => p.completed).map((p) => p.chapterId));
    // Look for the first chapter after the last read one that isn't completed
    for (let i = lastReadIdx + 1; i < chapterList.length; i++) {
      if (!completedIds.has(chapterList[i].id)) {
        continueChapterId = chapterList[i].id;
        return;
      }
    }
    // All caught up — offer to re-read from start
    continueChapterId = null;
  }

  const isInLibrary = $derived(library.isInLibrary(mangaId));
  const libraryEntry = $derived(library.entries.find((e) => e.id === mangaId));
  const title = $derived(manga ? getMangaTitle(manga) : '');
  const description = $derived(manga ? getMangaDescription(manga) : '');

  const visibleChapters = $derived(
    settingsStore.value.showExternalChapters
      ? chapters
      : chapters.filter((ch) => !ch.attributes.externalUrl)
  );

  type VolumeGroup = { key: string; label: string; chapters: Chapter[] };
  const volumeGroups = $derived.by<VolumeGroup[]>(() => {
    const map = new Map<string, Chapter[]>();
    for (const ch of visibleChapters) {
      const key = ch.attributes.volume ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ch);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return parseFloat(a) - parseFloat(b);
      })
      .map(([key, chs]) => ({
        key,
        label: key === '__none__' ? 'No Volume' : `Volume ${key}`,
        chapters: chs,
      }));
  });

  function toggleVolumeCollapse(key: string) {
    const next = new Set(collapsedVolumes);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsedVolumes = next;
  }

  function toggleChapterSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleVolumeSelect(group: VolumeGroup) {
    const allSelected = group.chapters.every((ch) => selectedIds.has(ch.id));
    const next = new Set(selectedIds);
    if (allSelected) group.chapters.forEach((ch) => next.delete(ch.id));
    else group.chapters.forEach((ch) => next.add(ch.id));
    selectedIds = next;
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleChapters.length) selectedIds = new Set();
    else selectedIds = new Set(visibleChapters.map((ch) => ch.id));
  }

  function exitSelectionMode() {
    selectionMode = false;
    selectedIds = new Set();
  }

  async function downloadSelected() {
    batchDownloading = true;
    const eligible = chapters.filter(
      (ch) => selectedIds.has(ch.id) && !ch.attributes.externalUrl
    );
    const count = await downloadsStore.queueMangaBatch(
      mangaId,
      title,
      eligible.map((ch) => ({
        chapterId: ch.id,
        mangaId,
        mangaTitle: title,
        chapterTitle: formatChapter(ch.attributes.volume, ch.attributes.chapter, ch.attributes.title),
        volume: ch.attributes.volume ?? undefined,
        chapterNum: ch.attributes.chapter ?? undefined,
        totalPages: ch.attributes.pages,
        path: undefined,
      }))
    );
    if (count > 0) {
      const queued = downloadsStore.mangaBatchQueue.length > 0;
      toast.success(queued
        ? `"${title}" queued for download (${count} chapters)`
        : `Queued ${count} chapter${count === 1 ? '' : 's'} for download`
      );
    }
    exitSelectionMode();
    batchDownloading = false;
  }

  const statusOptions = [
    { value: 'reading', label: 'Reading' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'plan_to_read', label: 'Plan to Read' },
    { value: 're_reading', label: 'Re-reading' },
    { value: 'completed', label: 'Completed' },
    { value: 'dropped', label: 'Dropped' },
  ];

  async function handleStatusChange(status: string) {
    await library.updateStatus(mangaId, status);
  }

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
        }, manga.attributes.latestUploadedChapter ?? undefined);
        toast.success('Added to library');
      }
    } finally {
      addingToLibrary = false;
    }
  }

</script>

<div class="h-full overflow-y-auto">
  {#if loadingManga}
    <div class="flex items-center justify-center h-64">
      <Spinner size={36} />
    </div>
  {:else if manga}
    <!-- Banner -->
    <div class="relative h-40 overflow-hidden">
      {#if manga.coverUrl}
        <img src={manga.coverUrl} alt="" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-20" />
      {/if}
      <div class="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--color-bg-base)]" />
      <!-- Back button over banner -->
      <button
        onclick={() => history.back()}
        class="absolute top-9 left-6 z-10 flex items-center gap-1.5 text-xs text-white/80 hover:text-white transition-colors bg-black/30 hover:bg-black/50 backdrop-blur-sm px-2.5 py-1.5 rounded-[var(--radius-md)]"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>
    </div>

    <!-- Content -->
    <div class="relative -mt-20 px-8 pb-8">
      <div class="flex gap-6">
        <!-- Cover -->
        <div class="flex-shrink-0 w-36 h-52 rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-lg)] bg-[var(--color-bg-overlay)]">
          {#if manga.coverUrl}
            <img src={manga.coverUrl} alt={title} class="w-full h-full object-cover" />
          {/if}
        </div>

        <!-- Info -->
        <div class="flex flex-col gap-3 pt-12 min-w-0">
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

          <div class="flex flex-wrap gap-2 mt-1">
            {#if visibleChapters.length > 0}
              <Button
                variant="accent"
                onclick={() => goto(`/manga/${mangaId}/read/${continueChapterId ?? visibleChapters[0].id}`)}
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {continueChapterId ? 'Continue Reading' : 'Read First'}
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
            {#if isInLibrary && auth.isLoggedIn && libraryEntry}
              <Select
                value={libraryEntry.status}
                options={statusOptions}
                class="h-9 text-sm"
                onchange={(e: Event) => handleStatusChange((e.target as HTMLSelectElement).value)}
              />
            {/if}
            {#if chapters.length > 0}
              {@const exportJob = epubExports.get(mangaId)}
              {#if exportJob}
                <div class="flex flex-col gap-1.5">
                  <Button variant="outline" onclick={() => (showEpubModal = true)}>
                    <svg class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Exporting… {exportJob.pct}%
                  </Button>
                  <div class="h-1 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden w-full">
                    <div
                      class="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300"
                      style="width: {exportJob.pct}%"
                    ></div>
                  </div>
                  <p class="text-xs text-[var(--color-text-muted)] truncate">{exportJob.step}</p>
                </div>
              {:else}
                <Button variant="outline" onclick={() => (showEpubModal = true)}>
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export EPUB
                </Button>
              {/if}
            {/if}
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
      <div class="mt-8 pb-4">
        <!-- Section header -->
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Chapters
            </h2>
            {#if visibleChapters.length > 0}
              <span class="text-xs text-[var(--color-text-muted)]">
                {readChapterIds.size} / {visibleChapters.length} read
              </span>
            {/if}
          </div>
          {#if visibleChapters.length > 0 && !loadingChapters}
            {#if selectionMode}
              <div class="flex items-center gap-2">
                <button
                  onclick={toggleSelectAll}
                  class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors"
                >
                  {selectedIds.size === visibleChapters.length ? 'Deselect all' : 'Select all'}
                </button>
                <button
                  onclick={exitSelectionMode}
                  class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            {:else}
              <button
                onclick={() => (selectionMode = true)}
                class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1"
              >
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                Select
              </button>
            {/if}
          {/if}
        </div>

        <!-- Progress bar -->
        {#if !loadingChapters && visibleChapters.length > 0}
          {@const pct = Math.min(100, Math.round((readChapterIds.size / visibleChapters.length) * 100))}
          <div class="mb-3 h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500 {pct >= 100 ? 'bg-green-500' : 'bg-[var(--color-accent)]'}"
              style="width: {pct}%"
            ></div>
          </div>
        {/if}

        {#if loadingChapters}
          <div class="flex items-center justify-center py-12">
            <Spinner size={28} />
          </div>
        {:else if visibleChapters.length === 0}
          <p class="text-sm text-[var(--color-text-muted)] py-8 text-center">No chapters available</p>
        {:else}
          <div class="flex flex-col gap-4">
            {#each volumeGroups as group (group.key)}
              {@const groupAllSelected = group.chapters.every((ch) => selectedIds.has(ch.id))}
              {@const groupSomeSelected = group.chapters.some((ch) => selectedIds.has(ch.id))}
              {@const isCollapsed = collapsedVolumes.has(group.key)}

              <div>
                <!-- Volume header -->
                <div class="flex items-center gap-2 mb-1">
                  <!-- Collapse toggle -->
                  <button
                    onclick={() => toggleVolumeCollapse(group.key)}
                    class="flex items-center gap-1.5 flex-1 min-w-0 group/vol py-1"
                  >
                    <svg
                      class="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0 transition-transform duration-150 {isCollapsed ? '-rotate-90' : ''}"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                    <span class="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider group-hover/vol:text-[var(--color-text-primary)] transition-colors">
                      {group.label}
                    </span>
                    <span class="text-[10px] text-[var(--color-text-muted)]">{group.chapters.length} ch</span>
                  </button>

                  <!-- Volume select-all checkbox (selection mode only) -->
                  {#if selectionMode}
                    <button
                      onclick={() => toggleVolumeSelect(group)}
                      class="flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                        {groupAllSelected
                          ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                          : groupSomeSelected
                            ? 'bg-[var(--color-accent)]/40 border-[var(--color-accent)]'
                            : 'border-[var(--color-border-strong)] hover:border-[var(--color-accent)]'}"
                      title={groupAllSelected ? 'Deselect volume' : 'Select volume'}
                    >
                      {#if groupAllSelected}
                        <svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      {:else if groupSomeSelected}
                        <div class="w-2 h-0.5 bg-white rounded-full"></div>
                      {/if}
                    </button>
                  {/if}
                </div>

                <!-- Chapter list -->
                {#if !isCollapsed}
                  <div class="flex flex-col gap-0.5">
                    {#each group.chapters as chapter (chapter.id)}
                      <ChapterItem
                        {chapter}
                        {mangaId}
                        mangaTitle={title}
                        isRead={readChapterIds.has(chapter.id)}
                        {selectionMode}
                        selected={selectedIds.has(chapter.id)}
                        onselect={() => toggleChapterSelect(chapter.id)}
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Batch selection toolbar -->
{#if selectionMode && selectedIds.size > 0}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 bg-[var(--color-bg-elevated)] border border-[var(--color-border-strong)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] backdrop-blur-sm">
    <span class="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
      {selectedIds.size} selected
    </span>
    <div class="w-px h-4 bg-[var(--color-border)]"></div>
    <Button variant="accent" size="sm" loading={batchDownloading} onclick={downloadSelected}>
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      Download
    </Button>
    <button
      onclick={exitSelectionMode}
      class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
      aria-label="Cancel selection"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
{/if}

{#if manga && showEpubModal}
  <EpubExportModal
    {manga}
    {chapters}
    open={showEpubModal}
    onclose={() => (showEpubModal = false)}
  />
{/if}
