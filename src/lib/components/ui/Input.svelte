<script lang="ts">
  import { cn } from '$lib/utils';

  interface Props {
    class?: string;
    value?: string;
    placeholder?: string;
    type?: string;
    disabled?: boolean;
    autocomplete?: import('svelte/elements').HTMLInputAttributes['autocomplete'];
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }

  let {
    class: className = '',
    value = $bindable(''),
    type = 'text',
    placeholder,
    disabled,
    autocomplete,
    oninput,
    onchange,
    onkeydown,
  }: Props = $props();
</script>

<input
  bind:value
  {type}
  {placeholder}
  {disabled}
  {autocomplete}
  {oninput}
  {onchange}
  {onkeydown}
  class={cn(
    'h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-colors',
    className
  )}
/>
