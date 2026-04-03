<script lang="ts">
  import { downloadsStore } from '$lib/stores/downloads.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { toast } from 'svelte-sonner';

  const statusVariants: Record<string, 'green' | 'yellow' | 'blue' | 'red' | 'accent' | 'default'> = {
    completed: 'green',
    downloading: 'accent',
    pending: 'yellow',
    error: 'red',
  };

  async function handleDelete(mangaId: string, chapterId: string) {
    await downloadsStore.deleteDownload(mangaId, chapterId);
    toast.success('Download deleted');
  }

  const grouped = $derived(() => {
    const map = new Map<string, typeof downloadsStore.downloads>();
    for (const d of downloadsStore.downloads) {
      const key = d.mangaId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()].map(([mangaId, chapters]) => ({
      mangaId,
      mangaTitle: chapters[0].mangaTitle ?? 'Unknown',
      chapters,
    }));
  });
</script>

<div class="h-full flex flex-col overflow-hidden">
  <div class="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold text-[var(--color-text-primary)]">Downloads</h1>
      <span class="text-sm text-[var(--color-text-muted)]">{downloadsStore.downloads.length} chapters</span>
    </div>
  </div>

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
      <div class="flex flex-col gap-6">
        {#each grouped() as group}
          <div>
            <a
              href="/manga/{group.mangaId}"
              class="text-sm font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors mb-2 block"
            >
              {group.mangaTitle}
            </a>
            <div class="flex flex-col gap-1">
              {#each group.chapters as chapter}
                <div class="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)]">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-[var(--color-text-primary)] truncate">{chapter.chapterTitle ?? `Chapter ${chapter.chapterNum}`}</p>
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
                      class="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] rounded transition-colors"
                    >
                      Read
                    </a>
                  {/if}
                  <button
                    onclick={() => handleDelete(chapter.mangaId, chapter.chapterId)}
                    class="flex items-center justify-center w-7 h-7 rounded text-[var(--color-text-muted)] hover:bg-[var(--color-red-muted)] hover:text-[var(--color-red)] transition-all"
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
    {/if}
  </div>
</div>
