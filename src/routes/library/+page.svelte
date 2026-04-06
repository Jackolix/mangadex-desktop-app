<script lang="ts">
  import { library } from '$lib/stores/library.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { READING_STATUS_LABELS } from '$lib/utils';
  import { goto } from '$app/navigation';
  import type { LibraryEntry } from '$lib/api/types';

  let filterStatus = $state('all');
  let searchQuery = $state('');

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'reading', label: 'Reading' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'plan_to_read', label: 'Plan to Read' },
    { value: 'dropped', label: 'Dropped' },
    { value: 're_reading', label: 'Re-reading' },
    { value: 'completed', label: 'Completed' },
  ];

  const statusVariants: Record<string, 'green' | 'yellow' | 'blue' | 'red' | 'purple' | 'default' | 'accent'> = {
    reading: 'green',
    on_hold: 'yellow',
    plan_to_read: 'blue',
    dropped: 'red',
    re_reading: 'purple',
    completed: 'default',
  };

  const filtered = $derived(
    library.entries.filter((e) => {
      const matchStatus = filterStatus === 'all' || e.status === filterStatus;
      const matchSearch = !searchQuery || e.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    })
  );

  // Context menu
  let contextMenu = $state<{ entry: LibraryEntry; x: number; y: number } | null>(null);

  function openContextMenu(e: MouseEvent, entry: LibraryEntry) {
    e.preventDefault();
    e.stopPropagation();
    // Clamp to viewport so menu never goes off-screen
    const menuW = 192;
    const menuH = 280;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    contextMenu = { entry, x, y };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  async function setStatus(status: string) {
    if (!contextMenu) return;
    await library.updateStatus(contextMenu.entry.id, status);
    closeContextMenu();
  }

  async function removeEntry() {
    if (!contextMenu) return;
    await library.removeFromLibrary(contextMenu.entry.id);
    closeContextMenu();
  }
</script>

<!-- Close context menu on outside click -->
<svelte:window
  on:click={closeContextMenu}
  on:keydown={(e) => e.key === 'Escape' && closeContextMenu()}
/>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-[var(--color-text-primary)]">Library</h1>
      <div class="flex items-center gap-2">
        {#if library.syncing}
          <span class="text-xs text-[var(--color-text-muted)] animate-pulse">Syncing...</span>
        {/if}
        <span class="text-sm text-[var(--color-text-muted)]">{library.entries.length} manga</span>
      </div>
    </div>
    <div class="flex gap-3">
      <Input bind:value={searchQuery} placeholder="Search library..." class="flex-1" />
      <Select bind:value={filterStatus} options={statusOptions} class="w-40" />
    </div>
  </div>

  <!-- Grid -->
  <div class="flex-1 overflow-y-auto px-6 py-5">
    {#if library.loading}
      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(144px, 1fr))">
        {#each Array(12) as _}
          <div class="flex flex-col gap-2">
            <div class="w-full rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] animate-pulse" style="aspect-ratio: 2/3" />
            <div class="h-3 rounded bg-[var(--color-bg-elevated)] animate-pulse w-4/5" />
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div class="flex flex-col items-center justify-center h-64 gap-4">
        <svg class="w-16 h-16 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <div class="text-center">
          <p class="text-[var(--color-text-muted)] text-sm">Your library is empty</p>
          <a href="/browse" class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors mt-1 inline-block">
            Browse manga to add →
          </a>
        </div>
      </div>
    {:else}
      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(144px, 1fr))">
        {#each filtered as entry}
          <div class="group flex flex-col gap-1.5">
            <!-- Cover -->
            <button
              onclick={() => goto(`/manga/${entry.id}`)}
              oncontextmenu={(e) => openContextMenu(e, entry)}
              class="relative w-full rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-overlay)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style="aspect-ratio: 2/3"
            >
              {#if entry.coverUrl}
                <img
                  src={entry.coverUrl}
                  alt={entry.title}
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center">
                  <svg class="w-8 h-8 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
              {/if}

              <!-- Hover gradient -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

              <!-- Status badge — solid background for readability over any image -->
              <div class="absolute top-1.5 left-1.5">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm
                  {entry.status === 'reading'     ? 'bg-green-600/90 text-white' :
                   entry.status === 'completed'   ? 'bg-blue-600/90 text-white' :
                   entry.status === 'on_hold'     ? 'bg-yellow-500/90 text-white' :
                   entry.status === 're_reading'  ? 'bg-purple-600/90 text-white' :
                   entry.status === 'dropped'     ? 'bg-red-600/90 text-white' :
                                                    'bg-black/70 text-white'}">
                  {READING_STATUS_LABELS[entry.status] ?? entry.status}
                </span>
              </div>

              {#if entry.contentRating !== 'safe'}
                <div class="absolute top-1.5 right-1.5">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm
                    {entry.contentRating === 'suggestive' ? 'bg-yellow-500/90 text-white' : 'bg-red-600/90 text-white'}">
                    {entry.contentRating}
                  </span>
                </div>
              {/if}
            </button>

            <!-- Title -->
            <button
              onclick={() => goto(`/manga/${entry.id}`)}
              class="text-xs font-medium text-[var(--color-text-primary)] line-clamp-2 leading-tight text-left hover:text-[var(--color-accent)] transition-colors"
            >
              {entry.title}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Context menu -->
{#if contextMenu}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed z-50 min-w-48 rounded-[var(--radius-lg)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] shadow-[var(--shadow-lg)] py-1 text-sm"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Manga title -->
    <div class="px-3 py-2 border-b border-[var(--color-border)]">
      <p class="text-xs font-semibold text-[var(--color-text-primary)] truncate max-w-44">{contextMenu.entry.title}</p>
    </div>

    <!-- Status options -->
    <div class="py-1">
      <p class="px-3 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Set Status</p>
      {#each statusOptions.filter(o => o.value !== 'all') as option}
        <button
          onclick={() => setStatus(option.value)}
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors
            {contextMenu.entry.status === option.value
              ? 'text-[var(--color-accent)] bg-[var(--color-accent-muted)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)]'}"
        >
          {#if contextMenu.entry.status === option.value}
            <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          {:else}
            <span class="w-3 flex-shrink-0" />
          {/if}
          {option.label}
        </button>
      {/each}
    </div>

    <!-- Danger zone -->
    <div class="border-t border-[var(--color-border)] py-1">
      <button
        onclick={removeEntry}
        class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-red)] hover:bg-[var(--color-red-muted)] transition-colors"
      >
        <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Remove from Library
      </button>
    </div>
  </div>
{/if}
