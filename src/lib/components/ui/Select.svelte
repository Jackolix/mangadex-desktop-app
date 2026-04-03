<script lang="ts">
  import { cn } from '$lib/utils';

  interface Props {
    class?: string;
    options: { value: string; label: string }[];
    value?: string;
    disabled?: boolean;
    onchange?: (e: Event) => void;
  }

  let { class: className = '', options, value = $bindable(''), disabled, onchange }: Props = $props();
</script>

<select
  bind:value
  {disabled}
  {onchange}
  class={cn(
    'h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-colors cursor-pointer pr-8',
    className
  )}
>
  {#each options as option}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>

<style>
  select {
    appearance: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235a5a70' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
</style>
