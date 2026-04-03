<script lang="ts">
  import { cn } from '$lib/utils';
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'default' | 'accent' | 'green' | 'red' | 'yellow' | 'blue' | 'purple';
    size?: 'sm' | 'md';
    class?: string;
    children?: Snippet;
  }

  let { variant = 'default', size = 'sm', class: className = '', children }: Props = $props();

  const base = 'inline-flex items-center rounded-full font-medium';

  const variants = {
    default: 'bg-[var(--color-bg-overlay)] text-[var(--color-text-secondary)]',
    accent: 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]',
    green: 'bg-[var(--color-green-muted)] text-[var(--color-green)]',
    red: 'bg-[var(--color-red-muted)] text-[var(--color-red)]',
    yellow: 'bg-[var(--color-yellow-muted)] text-[var(--color-yellow)]',
    blue: 'bg-[var(--color-blue-muted)] text-[var(--color-blue)]',
    purple: 'bg-[var(--color-purple-muted)] text-[var(--color-purple)]',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
  };
</script>

<span class={cn(base, variants[variant], sizes[size], className)}>
  {@render children?.()}
</span>
