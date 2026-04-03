<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'default' | 'ghost' | 'outline' | 'destructive' | 'accent';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    loading?: boolean;
    children?: Snippet;
    class?: string;
  }

  let {
    variant = 'default',
    size = 'md',
    loading = false,
    disabled,
    class: className = '',
    children,
    ...props
  }: Props = $props();

  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius-md)] transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] select-none';

  const variants = {
    default: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-overlay)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
    ghost: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]',
    outline: 'border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]',
    destructive: 'bg-[var(--color-red-muted)] text-[var(--color-red)] hover:bg-[var(--color-red)] hover:text-white border border-transparent hover:border-[var(--color-red)]',
    accent: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-sm)]',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-4 text-sm',
    lg: 'h-10 px-6 text-sm',
    icon: 'h-9 w-9 p-0',
  };
</script>

<button
  class={cn(base, variants[variant], sizes[size], className)}
  disabled={disabled || loading}
  {...props}
>
  {#if loading}
    <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  {/if}
  {@render children?.()}
</button>
