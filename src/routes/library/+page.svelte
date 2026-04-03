<script lang="ts">
  import { library } from '$lib/stores/library.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { READING_STATUS_LABELS } from '$lib/utils';

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

  async function updateStatus(id: string, status: string) {
    await library.updateStatus(id, status);
  }
</script>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-lg font-semibold text-[var(--color-text-primary)]">Library</h1>
      <span class="text-sm text-[var(--color-text-muted)]">{library.entries.length} manga</span>
    </div>
    <div class="flex gap-3">
      <Input bind:value={searchQuery} placeholder="Search library..." class="flex-1" />
      <Select bind:value={filterStatus} options={statusOptions} class="w-40" />
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto px-6 py-5">
    {#if library.loading}
      <div class="flex items-center justify-center h-64">
        <div class="text-[var(--color-text-muted)] text-sm">Loading...</div>
      </div>
    {:else if filtered.length === 0}
      <div class="flex flex-col items-center justify-center h-64 gap-4">
        <svg class="w-16 h-16 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <div class="text-center">
          <p class="text-[var(--color-text-muted)] text-sm">Your library is empty</p>
          <a href="/browse" class="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] transition-colors mt-1 inline-block">
            Browse manga to add →
          </a>
        </div>
      </div>
    {:else}
      <div class="grid gap-3">
        {#each filtered as entry}
          <a
            href="/manga/{entry.id}"
            class="flex items-center gap-4 p-3 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-elevated)] transition-colors group"
          >
            <!-- Cover -->
            <div class="w-12 h-16 rounded-[var(--radius-sm)] overflow-hidden bg-[var(--color-bg-overlay)] flex-shrink-0">
              {#if entry.coverUrl}
                <img src={entry.coverUrl} alt={entry.title} class="w-full h-full object-cover" />
              {/if}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent)] transition-colors">
                {entry.title}
              </p>
              <div class="flex items-center gap-2 mt-1">
                <Badge variant={statusVariants[entry.status] ?? 'default'} size="sm">
                  {READING_STATUS_LABELS[entry.status] ?? entry.status}
                </Badge>
                {#if entry.contentRating !== 'safe'}
                  <Badge variant={entry.contentRating === 'suggestive' ? 'yellow' : 'red'} size="sm">
                    {entry.contentRating}
                  </Badge>
                {/if}
              </div>
            </div>

            <!-- Status selector (click-through prevention) -->
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div onclick={(e) => e.stopPropagation()}>
              <Select
                value={entry.status}
                options={statusOptions.filter((o) => o.value !== 'all')}
                class="w-36 text-xs"
                onchange={(e: Event) => updateStatus(entry.id, (e.target as HTMLSelectElement).value)}
              />
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>
