<script lang="ts">
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import { downloadsStore } from '$lib/stores/downloads.svelte';
  import { getMangaTitle, getMangaVolumeCoverUrls } from '$lib/api/mangadex';
  import { fetchImage } from '$lib/api/images';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { buildEpub } from '$lib/epub/builder';
  import { epubExports } from '$lib/stores/epubExports.svelte';
  import type { MangaWithCover, Chapter } from '$lib/api/types';

  interface Props {
    manga: MangaWithCover;
    chapters: Chapter[];
    open: boolean;
    onclose: () => void;
  }

  let { manga, chapters, open, onclose }: Props = $props();

  let selectedIds = $state<Set<string>>(new Set());
  let exporting = $state(false);

  type VolumeGroup = { key: string; label: string; chapters: Chapter[] };

  const volumeGroups = $derived.by<VolumeGroup[]>(() => {
    const map = new Map<string, Chapter[]>();
    for (const ch of chapters.filter((c) => !c.attributes.externalUrl)) {
      const key = ch.attributes.volume ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ch);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return parseFloat(a) - parseFloat(b);
      })
      .map(([key, chs]) => ({
        key,
        label: key === '__none__' ? 'No Volume' : `Volume ${key}`,
        chapters: chs.sort((a, b) => {
          const volA = parseFloat(a.attributes.volume ?? '0') || 0;
          const volB = parseFloat(b.attributes.volume ?? '0') || 0;
          if (volA !== volB) return volA - volB;
          return (parseFloat(a.attributes.chapter ?? '0') || 0) - (parseFloat(b.attributes.chapter ?? '0') || 0);
        }),
      }));
  });

  const allChapters = $derived(volumeGroups.flatMap((g) => g.chapters));

  const downloadedIds = $derived(
    new Set(
      downloadsStore.downloads
        .filter((d) => d.mangaId === manga.id && d.status === 'completed')
        .map((d) => d.chapterId)
    )
  );

  const allSelected = $derived(
    allChapters.length > 0 && allChapters.every((c) => selectedIds.has(c.id))
  );

  const selectedCount = $derived(selectedIds.size);

  // Pre-select all when modal opens
  $effect(() => {
    if (open) {
      selectedIds = new Set(allChapters.map((c) => c.id));
    }
  });

  function toggleAll() {
    if (allSelected) selectedIds = new Set();
    else selectedIds = new Set(allChapters.map((c) => c.id));
  }

  function toggleChapter(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleVolume(group: VolumeGroup) {
    const allInVolume = group.chapters.every((c) => selectedIds.has(c.id));
    const next = new Set(selectedIds);
    if (allInVolume) group.chapters.forEach((c) => next.delete(c.id));
    else group.chapters.forEach((c) => next.add(c.id));
    selectedIds = next;
  }

  function displayLabel(ch: Chapter): string {
    const { volume, chapter, title } = ch.attributes;
    const parts: string[] = [];
    if (volume) parts.push(`Vol.${volume}`);
    if (chapter) parts.push(`Ch.${chapter}`);
    if (title && !title.startsWith('Vol.') && !title.startsWith('Ch.')) parts.push(title);
    return parts.join(' ') || title || 'Oneshot';
  }

  async function handleExport() {
    const selected = allChapters.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;

    exporting = true;

    // Pick an output folder
    let outDir: string | null = null;
    try {
      outDir = await openDialog({ directory: true, multiple: false, title: 'Choose export folder' }) as string | null;
    } catch {
      exporting = false;
      return;
    }

    if (!outDir) {
      exporting = false;
      return;
    }

    // Close the modal immediately — export runs in background
    onclose();

    const mangaTitle = getMangaTitle(manga);
    const sanitizedTitle = mangaTitle.replace(/[<>:"/\\|?*]/g, '').trim().slice(0, 80);
    const capturedManga = manga;
    const capturedOutDir = outDir;

    const position = epubExports.enqueue(capturedManga.id, sanitizedTitle, async (signal) => {
      const toastId = toast.loading(`Exporting "${sanitizedTitle}"…`);
      epubExports.start(capturedManga.id);

      const CHAPTERS_PER_PART = settingsStore.value.epubChaptersPerPart;

      try {
        // Group selected chapters by volume
        const volMap = new Map<string, Chapter[]>();
        for (const ch of selected) {
          const key = ch.attributes.volume ?? '__none__';
          if (!volMap.has(key)) volMap.set(key, []);
          volMap.get(key)!.push(ch);
        }
        const rawVolGroups = [...volMap.entries()].sort(([a], [b]) => {
          if (a === '__none__') return 1;
          if (b === '__none__') return -1;
          return parseFloat(a) - parseFloat(b);
        });

        // Expand any group that exceeds the per-file chapter limit into parts.
        // This is most common for volume-less manga, but applies to any group.
        type ExportGroup = { label: string | null; seriesIndex: number; chapters: Chapter[]; coverVolKey: string | null };
        const exportGroups: ExportGroup[] = [];
        let seriesCounter = 0;
        for (const [volKey, chs] of rawVolGroups) {
          if (chs.length > CHAPTERS_PER_PART) {
            const totalParts = Math.ceil(chs.length / CHAPTERS_PER_PART);
            for (let p = 0; p < totalParts; p++) {
              seriesCounter++;
              exportGroups.push({
                label: totalParts === 1 && volKey === '__none__'
                  ? null
                  : volKey !== '__none__'
                    ? `Vol.${volKey}-${p + 1}`
                    : `Vol.${p + 1}`,
                seriesIndex: seriesCounter,
                chapters: chs.slice(p * CHAPTERS_PER_PART, (p + 1) * CHAPTERS_PER_PART),
                coverVolKey: volKey !== '__none__' ? volKey : null,
              });
            }
          } else {
            seriesCounter++;
            exportGroups.push({
              label: volKey === '__none__' ? null : `Vol.${volKey}`,
              seriesIndex: seriesCounter,
              chapters: chs,
              coverVolKey: volKey !== '__none__' ? volKey : null,
            });
          }
        }

        // Fetch all volume cover URLs upfront
        let volCoverUrls = new Map<string, string>();
        try {
          volCoverUrls = await getMangaVolumeCoverUrls(capturedManga.id);
        } catch {
          // no covers — continue without them
        }

        let exported = 0;
        for (let vi = 0; vi < exportGroups.length; vi++) {
          if (signal.aborted) {
            toast.warning(`Export of "${sanitizedTitle}" was cancelled`, { id: toastId });
            return;
          }

          const { label, seriesIndex, chapters, coverVolKey } = exportGroups[vi];
          const volumeTitle = label ? `${sanitizedTitle} ${label}` : sanitizedTitle;
          const fileName = `${volumeTitle}.epub`;

          const overallPct = Math.round((vi / exportGroups.length) * 100);
          const step = `${vi + 1}/${exportGroups.length}: ${volumeTitle}`;
          toast.loading(step, { id: toastId });
          epubExports.update(capturedManga.id, step, overallPct);

          // Fetch cover for this volume
          let volumeCoverBytes: Uint8Array | null = null;
          const coverUrl = coverVolKey ? volCoverUrls.get(coverVolKey) : undefined;
          const urlToFetch = coverUrl ?? capturedManga.coverUrl;
          if (urlToFetch) {
            try {
              volumeCoverBytes = await fetchImage(urlToFetch);
            } catch {
              // skip cover
            }
          }

          try {
            const sep = capturedOutDir.includes('/') ? '/' : '\\';
            await buildEpub({
              manga: capturedManga,
              selectedChapters: chapters,
              volumeTitle,
              seriesIndex,
              volumeCoverBytes,
              outPath: `${capturedOutDir}${sep}${fileName}`,
              onProgress: (substep, subPct) => {
                const blended = Math.round(overallPct + (subPct / exportGroups.length));
                epubExports.update(capturedManga.id, substep, blended);
                toast.loading(substep, { id: toastId });
              },
            });
            exported++;
          } catch (e) {
            console.error(`[epub] Failed group "${volumeTitle}":`, e);
            toast.error(`Failed to export ${volumeTitle}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (exported > 0) {
          toast.success(
            `Exported ${exported} file${exported === 1 ? '' : 's'} to folder`,
            { id: toastId }
          );
        }
      } catch (e) {
        console.error('[epub] Export failed:', e);
        toast.error('Export failed: ' + (e instanceof Error ? e.message : String(e)), { id: toastId });
      } finally {
        epubExports.finish(capturedManga.id);
      }
    });

    if (position > 0) {
      toast.info(`"${sanitizedTitle}" queued for export (position ${position})`);
    }
  }

  const exportJob = $derived(epubExports.get(manga.id));

  function handleBackdropClick() {
    if (!exporting) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !exporting) onclose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="relative bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md flex flex-col max-h-[85vh]"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <h2 class="text-base font-semibold text-[var(--color-text-primary)]">Export EPUB</h2>
        <button
          class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
          disabled={exporting}
          onclick={onclose}
          aria-label="Close"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Manga info -->
      <div class="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)]">
        {#if manga.coverUrl}
          <img
            src={manga.coverUrl}
            alt={getMangaTitle(manga)}
            class="w-10 h-14 object-cover rounded-[var(--radius-sm)] flex-shrink-0"
          />
        {/if}
        <div class="min-w-0">
          <p class="text-sm font-medium text-[var(--color-text-primary)] truncate">{getMangaTitle(manga)}</p>
          {#if manga.authorName}
            <p class="text-xs text-[var(--color-text-muted)] truncate">by {manga.authorName}</p>
          {/if}
          {#if !exportJob}
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">Missing chapters will be fetched automatically.</p>
          {/if}
        </div>
      </div>

      {#if exportJob}

      <!-- Progress view (export running) -->
        <div class="px-5 py-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <svg class="animate-spin w-5 h-5 text-[var(--color-accent)] flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p class="text-sm font-medium text-[var(--color-text-primary)]">Exporting… {exportJob.pct}%</p>
          </div>
          <div class="w-full h-1.5 bg-[var(--color-bg-overlay)] rounded-full overflow-hidden">
            <div
              class="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300"
              style="width: {exportJob.pct}%"
            />
          </div>
          <p class="text-xs text-[var(--color-text-muted)] truncate">{exportJob.step}</p>
          <p class="text-xs text-[var(--color-text-muted)] italic">Export is running in the background — you can close this window.</p>
          <div class="flex justify-end">
            <Button variant="destructive" size="sm" onclick={() => { epubExports.cancelCurrent(); onclose(); }}>
              Cancel Export
            </Button>
          </div>
        </div>
      {:else}

      <!-- Select all row -->
      <div class="px-5 py-2.5 border-b border-[var(--color-border)]">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            disabled={exporting || allChapters.length === 0}
            onchange={toggleAll}
            class="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
          />
          <span class="text-sm text-[var(--color-text-secondary)]">
            Select all ({allChapters.length} chapter{allChapters.length === 1 ? '' : 's'})
          </span>
        </label>
      </div>

      <!-- Chapter list grouped by volume -->
      <div class="overflow-y-auto flex-1 px-3 py-2 min-h-0">
        {#if allChapters.length === 0}
          <p class="text-sm text-[var(--color-text-muted)] text-center py-8">No chapters available.</p>
        {:else}
          <div class="flex flex-col gap-3 py-1">
            {#each volumeGroups as group (group.key)}
              {@const volAllSelected = group.chapters.every((c) => selectedIds.has(c.id))}
              {@const volSomeSelected = group.chapters.some((c) => selectedIds.has(c.id))}
              <div>
                <!-- Volume header -->
                <label class="flex items-center gap-2 px-2 py-1.5 cursor-pointer group/vol">
                  <div
                    class="flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                      {volAllSelected
                        ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                        : volSomeSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/30'
                          : 'border-[var(--color-border-strong)] group-hover/vol:border-[var(--color-accent)]'}"
                    onclick={() => toggleVolume(group)}
                  >
                    {#if volAllSelected}
                      <svg class="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    {:else if volSomeSelected}
                      <div class="w-2 h-0.5 bg-[var(--color-accent)] rounded-full"></div>
                    {/if}
                  </div>
                  <span class="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider flex-1">
                    {group.label}
                  </span>
                  <span class="text-[10px] text-[var(--color-text-muted)]">{group.chapters.length} ch</span>
                </label>

                <!-- Chapters in volume -->
                <div class="flex flex-col gap-0.5 ml-2">
                  {#each group.chapters as ch (ch.id)}
                    <label
                      class="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-elevated)] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(ch.id)}
                        disabled={exporting}
                        onchange={() => toggleChapter(ch.id)}
                        class="w-3.5 h-3.5 accent-[var(--color-accent)] cursor-pointer flex-shrink-0"
                      />
                      <span class="text-sm text-[var(--color-text-primary)] flex-1 min-w-0 truncate">
                        {displayLabel(ch)}
                      </span>
                      {#if downloadedIds.has(ch.id)}
                        <span title="Already downloaded" class="flex-shrink-0 text-[var(--color-green,#4ade80)]">
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                          </svg>
                        </span>
                      {:else}
                        <span title="Will be fetched" class="flex-shrink-0 text-[var(--color-text-muted)] opacity-50">
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                          </svg>
                        </span>
                      {/if}
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer (selection mode) -->
      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
        <Button variant="outline" disabled={exporting} onclick={onclose}>Cancel</Button>
        <Button
          variant="accent"
          loading={exporting}
          disabled={selectedCount === 0}
          onclick={handleExport}
        >
          {#if selectedCount > 0}
            {@const volCount = new Set(allChapters.filter((c) => selectedIds.has(c.id)).map((c) => c.attributes.volume ?? '__none__')).size}
            Export {volCount} Volume{volCount === 1 ? '' : 's'}
          {:else}
            Export
          {/if}
        </Button>
      </div>

      {/if}
    </div>
  </div>
{/if}
