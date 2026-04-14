<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.svelte';
  import { library } from '$lib/stores/library.svelte';

  const navItems = [
    {
      href: '/',
      label: 'Home',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />`,
    },
    {
      href: '/browse',
      label: 'Browse',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />`,
    },
    {
      href: '/library',
      label: 'Library',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />`,
    },
    {
      href: '/downloads',
      label: 'Downloads',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />`,
    },
  ];

  const bottomItems = [
    {
      href: '/settings',
      label: 'Settings',
      icon: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />`,
    },
  ];

  const currentPath = $derived(page.url.pathname);
</script>

<nav
  data-tauri-drag-region
  class="w-14 flex-shrink-0 flex flex-col items-center py-3 gap-1 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)]"
>
  <!-- Logo -->
  <a href="/" class="mb-3 flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-sm)] hover:opacity-80 transition-opacity">
    <img src="/mangadex-favicon.png" alt="MangaDex" class="w-full h-full object-contain" />
  </a>

  <div class="flex flex-col gap-1 flex-1">
    {#each navItems as item}
      {@const active = currentPath === item.href || (item.href !== '/' && currentPath.startsWith(item.href))}
      <a
        href={item.href}
        title={item.label}
        class="relative flex items-center justify-center w-10 h-10 rounded-[var(--radius-md)] transition-all duration-150 group
          {active
            ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]'}"
      >
        {#if active}
          <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--color-accent)] rounded-r-full" />
        {/if}
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          {@html item.icon}
        </svg>
        <!-- New chapters notification dot for Library -->
        {#if item.href === '/library' && library.newChapterCount > 0}
          <div class="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] rounded-full bg-[var(--color-accent)] flex items-center justify-center">
            <span class="text-[8px] font-bold text-white leading-none px-0.5">{library.newChapterCount > 9 ? '9+' : library.newChapterCount}</span>
          </div>
        {/if}
        <!-- Tooltip -->
        <span class="absolute left-12 z-50 px-2 py-1 text-xs font-medium text-white bg-[var(--color-bg-overlay)] rounded-[var(--radius-sm)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-[var(--shadow-md)] border border-[var(--color-border)]">
          {item.label}{item.href === '/library' && library.newChapterCount > 0 ? ` (${library.newChapterCount} new)` : ''}
        </span>
      </a>
    {/each}
  </div>

  <div class="flex flex-col gap-1">
    {#each bottomItems as item}
      {@const active = currentPath.startsWith(item.href)}
      <a
        href={item.href}
        title={item.label}
        class="flex items-center justify-center w-10 h-10 rounded-[var(--radius-md)] transition-all duration-150 group
          {active
            ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]'}"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          {@html item.icon}
        </svg>
        <span class="absolute left-12 z-50 px-2 py-1 text-xs font-medium text-white bg-[var(--color-bg-overlay)] rounded-[var(--radius-sm)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-[var(--shadow-md)] border border-[var(--color-border)]">
          {item.label}
        </span>
      </a>
    {/each}

    <!-- User avatar / login -->
    {#if auth.isLoggedIn}
      <button
        title={auth.user?.attributes.username ?? 'Account'}
        class="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] text-sm font-bold hover:bg-[var(--color-accent)] hover:text-white transition-all"
        onclick={() => goto('/settings')}
      >
        {auth.user?.attributes.username?.[0]?.toUpperCase() ?? '?'}
      </button>
    {:else}
      <button
        title="Sign In"
        class="flex items-center justify-center w-10 h-10 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-all group"
        onclick={() => goto('/settings')}
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      </button>
    {/if}
  </div>
</nav>
