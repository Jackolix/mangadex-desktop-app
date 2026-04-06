<script lang="ts">
  import { goto } from '$app/navigation';
  import Badge from './ui/Badge.svelte';
  import type { Chapter } from '$lib/api/types';
  import { formatChapter, formatRelativeDate } from '$lib/utils';
  import { downloadsStore } from '$lib/stores/downloads.svelte';

  interface Props {
    chapter: Chapter;
    mangaId: string;
    mangaTitle?: string;
    isRead?: boolean;
    selectionMode?: boolean;
    selected?: boolean;
    onselect?: () => void;
  }

  let { chapter, mangaId, mangaTitle, isRead = false, selectionMode = false, selected = false, onselect }: Props = $props();

  const title = formatChapter(
    chapter.attributes.volume,
    chapter.attributes.chapter,
    chapter.attributes.title
  );

  const scanlationGroup = chapter.relationships.find((r) => r.type === 'scanlation_group');
  const groupName = (scanlationGroup?.attributes as { name?: string })?.name;

  const isExternal = $derived(!!chapter.attributes.externalUrl);
  const isDownloaded = $derived(downloadsStore.isDownloaded(chapter.id));
  const isDownloading = $derived(downloadsStore.isDownloading(chapter.id));
  const downloadEntry = $derived(downloadsStore.getDownload(chapter.id));

  const downloadProgress = $derived(
    downloadEntry && downloadEntry.totalPages > 0
      ? Math.round((downloadEntry.downloadedPages / downloadEntry.totalPages) * 100)
      : 0
  );

  async function handleDownload(e: MouseEvent) {
    e.stopPropagation();
    await downloadsStore.queueDownload({
      chapterId: chapter.id,
      mangaId,
      mangaTitle,
      chapterTitle: title,
      volume: chapter.attributes.volume ?? undefined,
      chapterNum: chapter.attributes.chapter ?? undefined,
      totalPages: chapter.attributes.pages,
      path: undefined,
    });
  }

  async function handleDeleteDownload(e: MouseEvent) {
    e.stopPropagation();
    await downloadsStore.deleteDownload(mangaId, chapter.id);
  }

  function handleClick() {
    if (selectionMode) {
      onselect?.();
    } else {
      goto(`/manga/${mangaId}/read/${chapter.id}`);
    }
  }
</script>

<button
  onclick={handleClick}
  class="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] transition-colors group text-left {selected ? 'bg-[var(--color-bg-elevated)]' : ''}"
>
  <!-- Read indicator / checkbox -->
  {#if selectionMode}
    <div class="flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
      {selected
        ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
        : 'border-[var(--color-border-strong)] bg-transparent group-hover:border-[var(--color-accent)]'}"
    >
      {#if selected}
        <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      {/if}
    </div>
  {:else}
    <div class="w-2 h-2 rounded-full flex-shrink-0 {isRead ? 'bg-[var(--color-text-muted)]' : 'bg-[var(--color-accent)]'}" />
  {/if}

  <!-- Info -->
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium {isRead && !selectionMode ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'} truncate">
      {title}
    </p>
    <div class="flex items-center gap-2 mt-0.5">
      {#if groupName}
        <span class="text-[10px] text-[var(--color-text-muted)] truncate">{groupName}</span>
        <span class="text-[var(--color-text-muted)] text-[10px]">·</span>
      {/if}
      <span class="text-[10px] text-[var(--color-text-muted)]">
        {formatRelativeDate(chapter.attributes.publishAt)}
      </span>
      <span class="text-[var(--color-text-muted)] text-[10px]">·</span>
      <span class="text-[10px] text-[var(--color-text-muted)]">{chapter.attributes.pages}p</span>
    </div>

    <!-- Download progress bar -->
    {#if isDownloading && downloadEntry}
      <div class="mt-1.5 w-full h-0.5 bg-[var(--color-bg-overlay)] rounded-full overflow-hidden">
        <div
          class="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300"
          style="width: {downloadProgress}%"
        />
      </div>
    {/if}
  </div>

  <!-- Actions (hidden in selection mode) -->
  {#if !selectionMode}
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Badge variant="default" size="sm">{chapter.attributes.translatedLanguage.toUpperCase()}</Badge>

      {#if isExternal}
        <a
          href={chapter.attributes.externalUrl!}
          target="_blank"
          rel="noopener noreferrer"
          onclick={(e) => e.stopPropagation()}
          class="flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)] transition-all"
          title="External chapter — opens in browser"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      {:else if isDownloaded}
        <button
          onclick={handleDeleteDownload}
          class="flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-green)] hover:bg-[var(--color-red-muted)] hover:text-[var(--color-red)] transition-all"
          title="Downloaded — click to remove"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
      {:else if isDownloading}
        <div class="flex items-center justify-center w-7 h-7">
          <svg class="animate-spin w-3.5 h-3.5 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      {:else}
        <button
          onclick={handleDownload}
          class="flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)] transition-all"
          title="Download chapter"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}
</button>
