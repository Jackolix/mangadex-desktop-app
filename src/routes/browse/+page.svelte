<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import MangaCard from '$lib/components/MangaCard.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { searchManga, getTags } from '$lib/api/mangadex';
  import type { MangaWithCover } from '$lib/api/types';
  import { debounce } from '$lib/utils';

  let query = $state(page.url.searchParams.get('q') ?? '');
  let sortBy = $state(page.url.searchParams.get('sort') ?? 'relevance');
  let status = $state(page.url.searchParams.get('status') ?? '');
  let contentRating = $state<string[]>(['safe', 'suggestive']);

  let results = $state<MangaWithCover[]>([]);
  let total = $state(0);
  let offset = $state(0);
  let loading = $state(false);
  let initialLoad = $state(true);
  const LIMIT = 28;

  const sortOptions = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'latestUploadedChapter', label: 'Latest Update' },
    { value: 'followedCount', label: 'Most Popular' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'createdAt', label: 'Newest' },
    { value: 'title', label: 'Title A-Z' },
  ];

  const statusOptions = [
    { value: '', label: 'Any Status' },
    { value: 'ongoing', label: 'Ongoing' },
    { value: 'completed', label: 'Completed' },
    { value: 'hiatus', label: 'Hiatus' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  async function doSearch(reset = true) {
    if (reset) {
      offset = 0;
      results = [];
    }
    loading = true;
    try {
      const orderKey = sortBy as 'relevance' | 'latestUploadedChapter' | 'followedCount' | 'rating' | 'createdAt' | 'title';
      const { data, total: t } = await searchManga({
        title: query || undefined,
        limit: LIMIT,
        offset,
        contentRating: contentRating as ('safe' | 'suggestive')[],
        status: status ? [status as 'ongoing' | 'completed' | 'hiatus' | 'cancelled'] : undefined,
        order: { [orderKey]: orderKey === 'title' ? 'asc' : 'desc' } as Record<string, 'asc' | 'desc'>,
      });
      if (reset) {
        results = data;
      } else {
        results = [...results, ...data];
      }
      total = t;
    } finally {
      loading = false;
      initialLoad = false;
    }
  }

  const debouncedSearch = debounce(() => doSearch(), 400);

  $effect(() => {
    doSearch();
  });

  $effect(() => {
    // Re-search when query changes
    query;
    sortBy;
    status;
    debouncedSearch();
  });

  async function loadMore() {
    offset += LIMIT;
    await doSearch(false);
  }

  const hasMore = $derived(results.length < total);
</script>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
    <h1 class="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Browse</h1>
    <div class="flex gap-3">
      <div class="relative flex-1">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <Input
          bind:value={query}
          placeholder="Search manga..."
          class="pl-9"
          oninput={debouncedSearch}
        />
      </div>
      <Select bind:value={sortBy} options={sortOptions} class="w-44" />
      <Select bind:value={status} options={statusOptions} class="w-36" />
    </div>
  </div>

  <!-- Results -->
  <div class="flex-1 overflow-y-auto px-6 py-5">
    {#if initialLoad && loading}
      <div class="flex items-center justify-center h-64">
        <Spinner size={36} />
      </div>
    {:else if results.length === 0 && !loading}
      <div class="flex flex-col items-center justify-center h-64 gap-3">
        <svg class="w-16 h-16 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <p class="text-[var(--color-text-muted)] text-sm">No results found</p>
        <p class="text-[var(--color-text-muted)] text-xs">Try a different search term</p>
      </div>
    {:else}
      <div class="mb-3 text-xs text-[var(--color-text-muted)]">
        {total.toLocaleString()} results
      </div>
      <div class="grid gap-5" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))">
        {#each results as manga}
          <MangaCard {manga} size="md" />
        {/each}
      </div>

      {#if hasMore}
        <div class="flex justify-center mt-8 mb-4">
          <Button onclick={loadMore} loading={loading} variant="outline">
            Load More
          </Button>
        </div>
      {/if}
    {/if}
  </div>
</div>
