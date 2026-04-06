<script lang="ts">
  import { goto } from '$app/navigation';
  import type { MangaWithCover } from '$lib/api/types';
  import { getMangaTitle } from '$lib/api/mangadex';
  import { cn } from '$lib/utils';

  interface Props {
    manga: MangaWithCover;
    size?: 'sm' | 'md' | 'lg';
    showRating?: boolean;
    class?: string;
  }

  let { manga, size = 'md', showRating = true, class: className = '' }: Props = $props();

  const title = getMangaTitle(manga);

  const sizes = {
    sm: { card: 'w-28', img: 'h-40' },
    md: { card: 'w-36', img: 'h-52' },
    lg: { card: 'w-44', img: 'h-64' },
  };

  const statusBadgeClass: Record<string, string> = {
    ongoing: 'bg-green-600/90 text-white',
    completed: 'bg-blue-600/90 text-white',
    hiatus: 'bg-yellow-500/90 text-white',
    cancelled: 'bg-red-600/90 text-white',
  };

  const ratingBadgeClass: Record<string, string> = {
    suggestive: 'bg-yellow-500/90 text-white',
    erotica: 'bg-red-600/90 text-white',
    pornographic: 'bg-red-600/90 text-white',
  };

  let imgError = $state(false);
  let imgLoaded = $state(false);
</script>

<button
  onclick={() => goto(`/manga/${manga.id}`)}
  class={cn(
    'group flex flex-col gap-2 text-left transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]',
    sizes[size].card,
    className
  )}
>
  <!-- Cover -->
  <div
    class={cn(
      'relative w-full rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-overlay)] flex-shrink-0',
      sizes[size].img
    )}
  >
    {#if manga.coverUrl && !imgError}
      <img
        src={manga.coverUrl}
        alt={title}
        loading="lazy"
        onload={() => (imgLoaded = true)}
        onerror={() => (imgError = true)}
        class={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          imgLoaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    {:else}
      <div class="w-full h-full flex items-center justify-center">
        <svg class="w-8 h-8 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
    {/if}

    <!-- Overlay gradient on hover -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

    <!-- Status badge -->
    <div class="absolute top-1.5 left-1.5">
      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm {statusBadgeClass[manga.attributes.status] ?? 'bg-black/70 text-white'}">
        {manga.attributes.status}
      </span>
    </div>

    {#if showRating && manga.attributes.contentRating !== 'safe'}
      <div class="absolute top-1.5 right-1.5">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm {ratingBadgeClass[manga.attributes.contentRating] ?? 'bg-black/70 text-white'}">
          {manga.attributes.contentRating}
        </span>
      </div>
    {/if}
  </div>

  <!-- Info -->
  <div class="flex flex-col gap-0.5 min-w-0">
    <p class="text-xs font-medium text-[var(--color-text-primary)] line-clamp-2 leading-tight group-hover:text-[var(--color-accent)] transition-colors">
      {title}
    </p>
    {#if manga.authorName}
      <p class="text-[10px] text-[var(--color-text-muted)] truncate">{manga.authorName}</p>
    {/if}
  </div>
</button>
