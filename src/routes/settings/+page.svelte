<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import { toast } from 'svelte-sonner';

  // Login form
  let username = $state('');
  let password = $state('');
  let loginLoading = $state(false);

  async function handleLogin() {
    loginLoading = true;
    const success = await auth.login(username, password);
    if (success) {
      toast.success(`Welcome, ${auth.user?.attributes.username}!`);
      username = '';
      password = '';
    } else {
      toast.error(auth.error ?? 'Login failed');
    }
    loginLoading = false;
  }

  async function handleLogout() {
    await auth.logout();
    toast.success('Logged out');
  }

  const readerModeOptions = [
    { value: 'paginated', label: 'Paginated' },
    { value: 'longstrip', label: 'Long Strip' },
    { value: 'double', label: 'Double Page' },
  ];

  const fitModeOptions = [
    { value: 'smart', label: 'Smart Fit' },
    { value: 'width', label: 'Fit Width' },
    { value: 'height', label: 'Fit Height' },
    { value: 'original', label: 'Original Size' },
  ];

  const ratingOptions = [
    { value: 'safe', label: 'Safe' },
    { value: 'suggestive', label: 'Suggestive' },
  ];

  function toggleRating(rating: string) {
    const current = settingsStore.value.contentRating;
    if (current.includes(rating)) {
      settingsStore.update({ contentRating: current.filter((r) => r !== rating) });
    } else {
      settingsStore.update({ contentRating: [...current, rating] });
    }
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="max-w-2xl mx-auto px-6 py-6">
    <h1 class="text-lg font-semibold text-[var(--color-text-primary)] mb-6">Settings</h1>

    <!-- Account -->
    <section class="mb-8">
      <h2 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">Account</h2>
      <div class="bg-[var(--color-bg-elevated)] rounded-[var(--radius-lg)] p-5">
        {#if auth.isLoggedIn}
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] flex items-center justify-center font-bold text-sm">
                {auth.user?.attributes.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p class="text-sm font-medium text-[var(--color-text-primary)]">{auth.user?.attributes.username}</p>
                <p class="text-xs text-[var(--color-text-muted)]">MangaDex Account</p>
              </div>
            </div>
            <Button variant="destructive" onclick={handleLogout} size="sm">Sign Out</Button>
          </div>
        {:else}
          <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="flex flex-col gap-4">
            <p class="text-sm text-[var(--color-text-secondary)]">Sign in to sync your library and reading progress</p>
            <div class="flex flex-col gap-3">
              <div>
                <label class="text-xs text-[var(--color-text-muted)] mb-1 block">Username</label>
                <Input bind:value={username} placeholder="Username" autocomplete="username" />
              </div>
              <div>
                <label class="text-xs text-[var(--color-text-muted)] mb-1 block">Password</label>
                <Input bind:value={password} type="password" placeholder="Password" autocomplete="current-password" />
              </div>
            </div>
            <Button type="submit" variant="accent" loading={loginLoading}>Sign In</Button>
          </form>
        {/if}
      </div>
    </section>

    <!-- Reader Settings -->
    <section class="mb-8">
      <h2 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">Reader</h2>
      <div class="bg-[var(--color-bg-elevated)] rounded-[var(--radius-lg)] divide-y divide-[var(--color-border)]">
        <div class="flex items-center justify-between px-5 py-4">
          <div>
            <p class="text-sm text-[var(--color-text-primary)]">Reading Mode</p>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">How pages are displayed</p>
          </div>
          <Select
            value={settingsStore.value.readerMode}
            options={readerModeOptions}
            class="w-40"
            onchange={(e: Event) => settingsStore.update({ readerMode: (e.target as HTMLSelectElement).value as 'paginated' | 'longstrip' | 'double' })}
          />
        </div>

        <div class="flex items-center justify-between px-5 py-4">
          <div>
            <p class="text-sm text-[var(--color-text-primary)]">Fit Mode</p>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">How images are scaled</p>
          </div>
          <Select
            value={settingsStore.value.fitMode}
            options={fitModeOptions}
            class="w-40"
            onchange={(e: Event) => settingsStore.update({ fitMode: (e.target as HTMLSelectElement).value as 'smart' | 'width' | 'height' | 'original' })}
          />
        </div>

        <div class="flex items-center justify-between px-5 py-4">
          <div>
            <p class="text-sm text-[var(--color-text-primary)]">Data Saver</p>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">Use compressed images to save bandwidth</p>
          </div>
          <button
            aria-label="Toggle data saver"
            onclick={() => settingsStore.update({ dataSaver: !settingsStore.value.dataSaver })}
            class="relative w-10 h-5 rounded-full transition-colors {settingsStore.value.dataSaver ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-overlay)]'}"
            role="switch"
            aria-checked={settingsStore.value.dataSaver}
          >
            <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform {settingsStore.value.dataSaver ? 'translate-x-5' : 'translate-x-0.5'}"></span>
          </button>
        </div>

        <div class="flex items-center justify-between px-5 py-4">
          <div>
            <p class="text-sm text-[var(--color-text-primary)]">Preload Pages</p>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">Number of pages to preload ahead</p>
          </div>
          <Select
            value={String(settingsStore.value.preloadPages)}
            options={[1,2,3,5,10].map((n) => ({ value: String(n), label: String(n) }))}
            class="w-24"
            onchange={(e: Event) => settingsStore.update({ preloadPages: Number((e.target as HTMLSelectElement).value) })}
          />
        </div>
      </div>
    </section>

    <!-- Content Settings -->
    <section class="mb-8">
      <h2 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">Content</h2>
      <div class="bg-[var(--color-bg-elevated)] rounded-[var(--radius-lg)] divide-y divide-[var(--color-border)]">
        <div class="flex items-center justify-between px-5 py-4">
          <div>
            <p class="text-sm text-[var(--color-text-primary)]">Content Rating</p>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">Types of content to show</p>
          </div>
          <div class="flex gap-2">
            {#each ['safe', 'suggestive', 'erotica'] as rating}
              <button
                onclick={() => toggleRating(rating)}
                class="px-3 py-1 rounded-full text-xs font-medium transition-all
                  {settingsStore.value.contentRating.includes(rating)
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-bg-overlay)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'}"
              >
                {rating}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex items-center justify-between px-5 py-4">
          <div>
            <p class="text-sm text-[var(--color-text-primary)]">Show Content Rating Badge</p>
          </div>
          <button
            aria-label="Toggle content rating badge"
            onclick={() => settingsStore.update({ showContentRating: !settingsStore.value.showContentRating })}
            class="relative w-10 h-5 rounded-full transition-colors {settingsStore.value.showContentRating ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-overlay)]'}"
            role="switch"
            aria-checked={settingsStore.value.showContentRating}
          >
            <span class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform {settingsStore.value.showContentRating ? 'translate-x-5' : 'translate-x-0.5'}"></span>
          </button>
        </div>
      </div>
    </section>

    <!-- About -->
    <section>
      <h2 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">About</h2>
      <div class="bg-[var(--color-bg-elevated)] rounded-[var(--radius-lg)] px-5 py-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[var(--color-text-primary)]">MangaDex Desktop</p>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">Version 0.1.0</p>
          </div>
          <span class="text-xs text-[var(--color-text-muted)]">Built with Tauri + Svelte</span>
        </div>
      </div>
    </section>
  </div>
</div>
