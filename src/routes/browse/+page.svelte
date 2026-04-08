<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import MangaCard from '$lib/components/MangaCard.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { searchManga, getTags } from '$lib/api/mangadex';
  import type { MangaWithCover, Tag } from '$lib/api/types';
  import { debounce } from '$lib/utils';

  let query = $state(page.url.searchParams.get('q') ?? '');
  let sortBy = $state(page.url.searchParams.get('sort') ?? 'relevance');
  let status = $state(page.url.searchParams.get('status') ?? '');
  let contentRating = $state<string[]>(['safe', 'suggestive']);

  // Advanced filters
  let allTags = $state<Tag[]>([]);
  let includedTagIds = $state<string[]>(
    page.url.searchParams.get('tags_in')?.split(',').filter(Boolean) ?? []
  );
  let excludedTagIds = $state<string[]>(
    page.url.searchParams.get('tags_ex')?.split(',').filter(Boolean) ?? []
  );
  let demographic = $state<string[]>(
    page.url.searchParams.get('demo')?.split(',').filter(Boolean) ?? []
  );
  let year = $state(page.url.searchParams.get('year') ?? '');

  let showAdvanced = $state(
    includedTagIds.length > 0 || excludedTagIds.length > 0 || demographic.length > 0 || year !== ''
  );

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

  const demographicOptions = [
    { value: 'shounen', label: 'Shounen' },
    { value: 'shoujo', label: 'Shoujo' },
    { value: 'seinen', label: 'Seinen' },
    { value: 'josei', label: 'Josei' },
  ];

  const GROUP_ORDER = ['genre', 'theme', 'format', 'content'];

  const tagGroups = $derived.by(() => {
    const groups = new Map<string, Tag[]>();
    for (const tag of allTags) {
      const g = tag.attributes.group;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(tag);
    }
    for (const tags of groups.values()) {
      tags.sort((a, b) =>
        (a.attributes.name['en'] ?? '').localeCompare(b.attributes.name['en'] ?? '')
      );
    }
    // Return in preferred group order
    const ordered = new Map<string, Tag[]>();
    for (const g of GROUP_ORDER) {
      if (groups.has(g)) ordered.set(g, groups.get(g)!);
    }
    for (const [g, tags] of groups) {
      if (!ordered.has(g)) ordered.set(g, tags);
    }
    return ordered;
  });

  const hasAdvancedFilters = $derived(
    includedTagIds.length > 0 || excludedTagIds.length > 0 || demographic.length > 0 || year !== ''
  );

  const activeFilterCount = $derived(
    includedTagIds.length + excludedTagIds.length + demographic.length + (year ? 1 : 0)
  );

  $effect(() => {
    getTags().then((data) => { allTags = data; });
  });

  function toggleTag(id: string) {
    if (includedTagIds.includes(id)) {
      includedTagIds = includedTagIds.filter((t) => t !== id);
      excludedTagIds = [...excludedTagIds, id];
    } else if (excludedTagIds.includes(id)) {
      excludedTagIds = excludedTagIds.filter((t) => t !== id);
    } else {
      includedTagIds = [...includedTagIds, id];
    }
    doSearch();
  }

  function toggleDemographic(demo: string) {
    demographic = demographic.includes(demo)
      ? demographic.filter((d) => d !== demo)
      : [...demographic, demo];
    doSearch();
  }

  function clearAdvanced() {
    includedTagIds = [];
    excludedTagIds = [];
    demographic = [];
    year = '';
    doSearch();
  }

  function getTagName(tag: Tag): string {
    return tag.attributes.name['en'] ?? Object.values(tag.attributes.name)[0] ?? '';
  }

  async function doSearch(reset = true) {
    if (reset) {
      offset = 0;
      results = [];
    }
    loading = true;
    try {
      const orderKey = sortBy as
        | 'relevance'
        | 'latestUploadedChapter'
        | 'followedCount'
        | 'rating'
        | 'createdAt'
        | 'title';
      const { data, total: t } = await searchManga({
        title: query || undefined,
        limit: LIMIT,
        offset,
        contentRating: contentRating as ('safe' | 'suggestive')[],
        status: status
          ? [status as 'ongoing' | 'completed' | 'hiatus' | 'cancelled']
          : undefined,
        order: { [orderKey]: orderKey === 'title' ? 'asc' : 'desc' } as Record<
          string,
          'asc' | 'desc'
        >,
        includedTags: includedTagIds.length > 0 ? includedTagIds : undefined,
        excludedTags: excludedTagIds.length > 0 ? excludedTagIds : undefined,
        publicationDemographic:
          demographic.length > 0
            ? (demographic as ('shounen' | 'shoujo' | 'seinen' | 'josei')[])
            : undefined,
        year: year ? parseInt(year) : undefined,
      });
      results = reset ? data : [...results, ...data];
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

  // Keep URL in sync so back-navigation restores search state
  $effect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (sortBy && sortBy !== 'relevance') params.set('sort', sortBy);
    if (status) params.set('status', status);
    if (includedTagIds.length) params.set('tags_in', includedTagIds.join(','));
    if (excludedTagIds.length) params.set('tags_ex', excludedTagIds.join(','));
    if (demographic.length) params.set('demo', demographic.join(','));
    if (year) params.set('year', year);
    const qs = params.toString();
    goto(`/browse${qs ? `?${qs}` : ''}`, { replaceState: true, keepFocus: true, noScroll: true });
  });
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

      <!-- Advanced toggle -->
      <button
        onclick={() => (showAdvanced = !showAdvanced)}
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors border {
          showAdvanced || hasAdvancedFilters
            ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
        }"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 1 0 0 4m0-4a2 2 0 1 1 0 4m-6 8a2 2 0 1 0 0-4m0 4a2 2 0 1 1 0-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 1 0 0-4m0 4a2 2 0 1 1 0-4m0 4v2m0-6V4" />
        </svg>
        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </button>
    </div>

    <!-- Advanced panel -->
    {#if showAdvanced}
      <div class="mt-4 flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
        <!-- Demographic + Year row -->
        <div class="flex gap-8 flex-wrap">
          <div>
            <p class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Demographic</p>
            <div class="flex gap-1.5 flex-wrap">
              {#each demographicOptions as opt}
                <button
                  onclick={() => toggleDemographic(opt.value)}
                  class="px-2.5 py-1 rounded-full text-xs transition-colors {
                    demographic.includes(opt.value)
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]'
                  }"
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <p class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Year</p>
            <Input
              bind:value={year}
              placeholder="e.g. 2020"
              class="w-28 h-7 text-xs"
              type="number"
              oninput={debouncedSearch}
            />
          </div>
        </div>

        <!-- Tags by group -->
        {#if allTags.length === 0}
          <div class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Spinner size={14} /> Loading tags…
          </div>
        {:else}
          {#each [...tagGroups.entries()] as [group, tags]}
            <div>
              <p class="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2 capitalize">{group}</p>
              <div class="flex gap-1.5 flex-wrap">
                {#each tags as tag}
                  {@const included = includedTagIds.includes(tag.id)}
                  {@const excluded = excludedTagIds.includes(tag.id)}
                  <button
                    onclick={() => toggleTag(tag.id)}
                    title={included ? 'Click to exclude' : excluded ? 'Click to clear' : 'Click to include'}
                    class="px-2.5 py-1 rounded-full text-xs transition-colors {
                      included
                        ? 'bg-[var(--color-accent)] text-white'
                        : excluded
                          ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/40'
                          : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]'
                    }"
                  >
                    {#if excluded}✕ {/if}{getTagName(tag)}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}

        <!-- Clear advanced -->
        {#if hasAdvancedFilters}
          <div>
            <button
              onclick={clearAdvanced}
              class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Clear all filters
            </button>
          </div>
        {/if}
      </div>
    {/if}
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
