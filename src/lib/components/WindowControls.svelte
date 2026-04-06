<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window';

  const win = getCurrentWindow();

  let isMaximized = $state(false);

  $effect(() => {
    win.isMaximized().then((v) => (isMaximized = v));
    const unlisten = win.onResized(async () => {
      isMaximized = await win.isMaximized();
    });
    return () => { unlisten.then((fn) => fn()); };
  });
</script>

<div class="controls">
  <button
    class="btn minimize"
    onclick={() => win.minimize()}
    title="Minimize"
    aria-label="Minimize"
  >
    <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
      <rect width="10" height="1" />
    </svg>
  </button>

  <button
    class="btn maximize"
    onclick={() => win.toggleMaximize()}
    title={isMaximized ? 'Restore' : 'Maximize'}
    aria-label={isMaximized ? 'Restore' : 'Maximize'}
  >
    {#if isMaximized}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="2" y="0" width="8" height="8" rx="0.5" />
        <path d="M0 2v6a2 2 0 0 0 2 2h6" />
      </svg>
    {:else}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="0.6" y="0.6" width="8.8" height="8.8" rx="0.5" />
      </svg>
    {/if}
  </button>

  <button
    class="btn close"
    onclick={() => win.close()}
    title="Close"
    aria-label="Close"
  >
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <line x1="1" y1="1" x2="9" y2="9" />
      <line x1="9" y1="1" x2="1" y2="9" />
    </svg>
  </button>
</div>

<style>
  .controls {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background-color 0.1s ease, color 0.1s ease;
    opacity: 0;
    transition: opacity 0.15s ease, background-color 0.1s ease, color 0.1s ease;
  }

  .controls:hover .btn {
    opacity: 1;
  }

  .btn:hover {
    background-color: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }

  .btn.close:hover {
    background-color: var(--color-red);
    color: #fff;
  }
</style>
