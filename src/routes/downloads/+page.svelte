<script lang="ts">
  import { downloadsStore } from '$lib/stores/downloads.svelte';
  import { epubExports } from '$lib/stores/epubExports.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { toast } from 'svelte-sonner';
  import type { DownloadEntry } from '$lib/api/types';

  const statusVariants: Record<string, 'green' | 'yellow' | 'blue' | 'red' | 'accent' | 'default'> = {
    completed: 'green',
    downloading: 'accent',
    pending: 'yellow',
    queued: 'default',
    error: 'red',
  };

  let selectedIds = $state(new Set<string>());
  let deleting = $state(false);

  type VolumeGroup = { key: string; label: string; chapters: DownloadEntry[] };
  type MangaGroup = { mangaId: string; mangaTitle: string; volumes: VolumeGroup[] };

  const grouped = $derived.by<MangaGroup[]>(() => {
    // Group by manga
    const mangaMap = new Map<string, DownloadEntry[]>();
    for (const d of downloadsStore.downloads) {
      if (!mangaMap.has(d.mangaId)) mangaMap.set(d.mangaId, []);
      mangaMap.get(d.mangaId)!.push(d);
    }

    return [...mangaMap.entries()].map(([mangaId, chapters]) => {
      // Group by volume
      const volMap = new Map<string, DownloadEntry[]>();
      for (const ch of chapters) {
        const key = ch.volume ?? '__none__';
        if (!volMap.has(key)) volMap.set(key, []);
        volMap.get(key)!.push(ch);
      }
      const volumes = [...volMap.entries()]
        .sort(([a], [b]) => {
          if (a === '__none__') return 1;
          if (b === '__none__') return -1;
          return parseFloat(a) - parseFloat(b);
        })
        .map(([key, chs]) => ({
          key,
          label: key === '__none__' ? 'No Volume' : `Volume ${key}`,
          chapters: chs.sort(
            (a, b) => (parseFloat(a.chapterNum ?? '0') || 0) - (parseFloat(b.chapterNum ?? '0') || 0)
          ),
        }));

      return { mangaId, mangaTitle: chapters[0].mangaTitle ?? 'Unknown', volumes };
    });
  });

  function toggleChapter(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleVolume(group: VolumeGroup) {
    const allSelected = group.chapters.every((c) => selectedIds.has(c.chapterId));
    const next = new Set(selectedIds);
    if (allSelected) group.chapters.forEach((c) => next.delete(c.chapterId));
    else group.chapters.forEach((c) => next.add(c.chapterId));
    selectedIds = next;
  }

  function toggleManga(manga: MangaGroup) {
    const all = manga.volumes.flatMap((v) => v.chapters);
    const allSelected = all.every((c) => selectedIds.has(c.chapterId));
    const next = new Set(selectedIds);
    if (allSelected) all.forEach((c) => next.delete(c.chapterId));
    else all.forEach((c) => next.add(c.chapterId));
    selectedIds = next;
  }

  function clearSelection() {
    selectedIds = new Set();
  }

  async function deleteSelected() {
    deleting = true;
    const toDelete = downloadsStore.downloads.filter((d) => selectedIds.has(d.chapterId));
    for (const d of toDelete) {
      await downloadsStore.deleteDownload(d.mangaId, d.chapterId);
    }
    toast.success(`Deleted ${toDelete.length} chapter${toDelete.length === 1 ? '' : 's'}`);
    selectedIds = new Set();
    deleting = false;
  }

  async function handleDeleteSingle(mangaId: string, chapterId: string) {
    await downloadsStore.deleteDownload(mangaId, chapterId);
    const next = new Set(selectedIds);
    next.delete(chapterId);
    selectedIds = next;
    toast.success('Download deleted');
  }
</script>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h1 class="text-lg font-semibold text-[var(--color-text-primary)]">Downloads</h1>
        <span class="text-sm text-[var(--color-text-muted)]">{downloadsStore.downloads.length} chapters</span>
      </div>
      {#if downloadsStore.downloads.length > 0}
        {#if selectedIds.size > 0}
          <div class="flex items-center gap-3">
            <span class="text-sm text-[var(--color-text-muted)]">{selectedIds.size} selected</span>
            <Button variant="destructive" size="sm" loading={deleting} onclick={deleteSelected}>
              Delete
            </Button>
            <button
              onclick={clearSelection}
              class="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        {:else}
          <button
            onclick={() => {
              // Select all
              selectedIds = new Set(downloadsStore.downloads.map((d) => d.chapterId));
            }}
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
  </div>

  <!-- EPUB Exports -->
  {#if epubExports.jobs.size > 0 || epubExports.exportQueue.length > 0}
    <div class="flex-shrink-0 px-6 py-3 border-b border-[var(--color-border)] flex flex-col gap-2">
      <p class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">EPUB Exports</p>
      {#each [...epubExports.jobs.values()] as job (job.mangaId)}
        <div class="flex flex-col gap-1.5 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-3 py-2.5">
          <div class="flex items-center gap-2">
            <svg class="animate-spin w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span class="text-sm text-[var(--color-text-primary)] flex-1 min-w-0 truncate">{job.step}</span>
            <span class="text-xs text-[var(--color-text-muted)] tabular-nums flex-shrink-0">{job.pct}%</span>
            <button
              onclick={() => epubExports.cancelCurrent()}
              class="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-red)] transition-colors"
              title="Cancel export"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="w-full h-1 bg-[var(--color-bg-overlay)] rounded-full overflow-hidden">
            <div
              class="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300"
              style="width: {job.pct}%"
            />
          </div>
        </div>
      {/each}
      {#each epubExports.exportQueue.slice(1) as queued (queued.mangaId)}
        <div class="flex items-center gap-2 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-3 py-2">
          <span class="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0">Queued</span>
          <span class="text-sm text-[var(--color-text-secondary)] flex-1 min-w-0 truncate">{queued.mangaTitle}</span>
          <button
            onclick={() => epubExports.cancelQueued(queued.mangaId)}
            class="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-red)] transition-colors"
            title="Remove from queue"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Manga download batch queue -->
  {#if downloadsStore.mangaBatchQueue.length > 0}
    <div class="flex-shrink-0 px-6 py-3 border-b border-[var(--color-border)] flex flex-col gap-2">
      <p class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Download Queue</p>
      {#each downloadsStore.mangaBatchQueue as batch (batch.mangaId)}
        <div class="flex items-center gap-2 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] px-3 py-2">
          <span class="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0">Waiting</span>
          <span class="text-sm text-[var(--color-text-secondary)] flex-1 min-w-0 truncate">{batch.mangaTitle}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto px-6 py-5">
    {#if downloadsStore.downloads.length === 0}
      <div class="flex flex-col items-center justify-center h-64 gap-4">
        <svg class="w-16 h-16 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        <div class="text-center">
          <p class="text-[var(--color-text-muted)] text-sm">No downloads yet</p>
          <p class="text-xs text-[var(--color-text-muted)] mt-1">Download chapters from the chapter list to read offline</p>
        </div>
      </div>
    {:else}
      <div class="flex flex-col gap-8">
        {#each grouped as manga (manga.mangaId)}
          {@const mangaAllSelected = manga.volumes.flatMap((v) => v.chapters).every((c) => selectedIds.has(c.chapterId))}
          {@const mangaSomeSelected = manga.volumes.flatMap((v) => v.chapters).some((c) => selectedIds.has(c.chapterId))}

          <div>
            <!-- Manga title row -->
            <div class="flex items-center gap-2 mb-3">
              <!-- Manga-level checkbox -->
              <button
                class="flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                  {mangaAllSelected
                    ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                    : mangaSomeSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/30'
                      : 'border-[var(--color-border-strong)] hover:border-[var(--color-accent)]'}"
                onclick={() => toggleManga(manga)}
                title={mangaAllSelected ? 'Deselect all' : 'Select all'}
              >
                {#if mangaAllSelected}
                  <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                {:else if mangaSomeSelected}
                  <div class="w-2 h-0.5 bg-[var(--color-accent)] rounded-full"></div>
                {/if}
              </button>
              <a
                href="/manga/{manga.mangaId}"
                class="text-sm font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
              >
                {manga.mangaTitle}
              </a>
            </div>

            <!-- Volume groups -->
            <div class="flex flex-col gap-3 ml-6">
              {#each manga.volumes as vol (vol.key)}
                {@const volAllSelected = vol.chapters.every((c) => selectedIds.has(c.chapterId))}
                {@const volSomeSelected = vol.chapters.some((c) => selectedIds.has(c.chapterId))}

                <div>
                  <!-- Volume header -->
                  <div class="flex items-center gap-2 mb-1.5">
                    <button
                      class="flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors
                        {volAllSelected
                          ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                          : volSomeSelected
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/30'
                            : 'border-[var(--color-border-strong)] hover:border-[var(--color-accent)]'}"
                      onclick={() => toggleVolume(vol)}
                      title={volAllSelected ? 'Deselect volume' : 'Select volume'}
                    >
                      {#if volAllSelected}
                        <svg class="w-2 h-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      {:else if volSomeSelected}
                        <div class="w-1.5 h-0.5 bg-[var(--color-accent)] rounded-full"></div>
                      {/if}
                    </button>
                    <span class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                      {vol.label}
                    </span>
                    <span class="text-[10px] text-[var(--color-text-muted)]">{vol.chapters.length} ch</span>
                  </div>

                  <!-- Chapters -->
                  <div class="flex flex-col gap-1 ml-5">
                    {#each vol.chapters as chapter (chapter.chapterId)}
                      {@const isSelected = selectedIds.has(chapter.chapterId)}
                      <div
                        class="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] transition-colors
                          {isSelected ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20' : 'bg-[var(--color-bg-elevated)]'}"
                      >
                        <!-- Row checkbox -->
                        <button
                          class="flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors
                            {isSelected
                              ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                              : 'border-[var(--color-border-strong)] hover:border-[var(--color-accent)]'}"
                          onclick={() => toggleChapter(chapter.chapterId)}
                        >
                          {#if isSelected}
                            <svg class="w-2 h-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          {/if}
                        </button>

                        <div class="flex-1 min-w-0">
                          <p class="text-sm text-[var(--color-text-primary)] truncate">
                            {chapter.chapterTitle ?? `Chapter ${chapter.chapterNum}`}
                          </p>
                          <div class="flex items-center gap-2 mt-0.5">
                            <Badge variant={statusVariants[chapter.status]} size="sm">{chapter.status}</Badge>
                            {#if chapter.status === 'downloading' || chapter.status === 'pending'}
                              <span class="text-[10px] text-[var(--color-text-muted)]">
                                {chapter.downloadedPages}/{chapter.totalPages} pages
                              </span>
                            {/if}
                          </div>
                          {#if chapter.status === 'downloading' && chapter.totalPages > 0}
                            <div class="mt-1.5 w-full h-0.5 bg-[var(--color-bg-overlay)] rounded-full">
                              <div
                                class="h-full bg-[var(--color-accent)] rounded-full transition-all"
                                style="width: {Math.round((chapter.downloadedPages / chapter.totalPages) * 100)}%"
                              />
                            </div>
                          {/if}
                        </div>

                        {#if chapter.status === 'completed'}
                          <a
                            href="/manga/{chapter.mangaId}/read/{chapter.chapterId}"
                            class="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] rounded transition-colors flex-shrink-0"
                          >
                            Read
                          </a>
                        {/if}
                        <button
                          onclick={() => handleDeleteSingle(chapter.mangaId, chapter.chapterId)}
                          class="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded text-[var(--color-text-muted)] hover:bg-[var(--color-red-muted)] hover:text-[var(--color-red)] transition-all"
                          title="Delete download"
                        >
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
