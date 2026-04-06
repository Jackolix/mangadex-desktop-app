<script lang="ts">
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { library } from '$lib/stores/library.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import { downloadsStore } from '$lib/stores/downloads.svelte';
  import { Toaster } from 'svelte-sonner';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';

  interface Props { children: Snippet; }
  let { children }: Props = $props();

  // Initialize stores sequentially to avoid SQLite "database is locked" errors
  $effect(() => {
    async function initAll() {
      await settingsStore.init();
      await auth.init();
      await library.load();
      await downloadsStore.init();
    }
    initAll();

    return () => downloadsStore.cleanup();
  });

  // Check if we're in the reader (full-screen, no sidebar)
  const isReader = $derived(page.url.pathname.includes('/read/'));
</script>

<div class="flex h-screen w-screen overflow-hidden">
  {#if !isReader}
    <Sidebar />
  {/if}
  <main class="flex-1 overflow-hidden">
    {@render children()}
  </main>
</div>

<Toaster
  position="bottom-right"
  toastOptions={{
    style: 'background: var(--color-bg-elevated); border: 1px solid var(--color-border); color: var(--color-text-primary);',
  }}
/>
