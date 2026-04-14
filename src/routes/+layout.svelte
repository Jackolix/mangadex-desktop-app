<script lang="ts">
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import WindowControls from '$lib/components/WindowControls.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { library } from '$lib/stores/library.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { downloadsStore } from '$lib/stores/downloads.svelte';
  import { Toaster, toast } from 'svelte-sonner';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';

  interface Props { children: Snippet; }
  let { children }: Props = $props();

  // Initialize stores sequentially to avoid SQLite "database is locked" errors
  $effect(() => {
    async function initAll() {
      await settingsStore.init();
      await auth.init();
      await library.load();
      await downloadsStore.init();

      // Check for new chapters in the background after everything is loaded
      const newIds = await library.checkForNewChapters();
      if (newIds.length > 0) {
        const titles = newIds
          .slice(0, 3)
          .map((id) => library.entries.find((e) => e.id === id)?.title)
          .filter(Boolean);
        const extra = newIds.length > 3 ? ` (+${newIds.length - 3} more)` : '';
        toast.info(`New chapters available: ${titles.join(', ')}${extra}`, {
          duration: 6000,
          action: {
            label: 'Library',
            onClick: () => goto('/library'),
          },
        });
      }
    }
    initAll();

    return () => downloadsStore.cleanup();
  });

  // Sync library from MangaDex whenever the user becomes logged in
  $effect(() => {
    if (auth.isLoggedIn) {
      library.syncFromMangaDex();
    }
  });

  // Check if we're in the reader (full-screen, no sidebar)
  const isReader = $derived(page.url.pathname.includes('/read/'));
</script>

<div class="relative flex h-screen w-screen overflow-hidden">
  <!-- Invisible drag region across the top of the window -->
  <div data-tauri-drag-region class="fixed top-0 left-0 right-0 h-[30px] z-[9998]" />

  {#if !isReader}
    <Sidebar />
  {/if}
  <main class="flex-1 overflow-hidden">
    {@render children()}
  </main>
  <WindowControls />
</div>

<Toaster
  position="bottom-right"
  toastOptions={{
    style: 'background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: var(--color-text-primary);',
  }}
/>
