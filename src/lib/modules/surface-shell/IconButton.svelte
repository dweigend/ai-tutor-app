<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../core/Icon.svelte';
	import type { IconName } from '../core/icons.js';
	let {
		icon,
		label,
		size = 'md',
		active,
		disabled = false,
		href,
		onclick,
		class: className = '',
		children
	}: {
		icon?: IconName;
		label: string;
		size?: 'md' | 'lg';
		active?: boolean;
		disabled?: boolean;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children?: Snippet;
	} = $props();
	let classes = $derived('m-icon-button ' + className);
</script>

{#snippet content()}
	{#if icon}<Icon name={icon} />{/if}{@render children?.()}
{/snippet}
{#if href !== undefined && !disabled}
	<a
		class={classes}
		data-size={size}
		aria-current={active ? 'page' : undefined}
		aria-label={label}
		title={label}
		{href}
		{onclick}
	>
		{@render content()}
	</a>
{:else}
	<button
		type="button"
		class={classes}
		data-size={size}
		{disabled}
		aria-pressed={active}
		aria-label={label}
		title={label}
		{onclick}
	>
		{@render content()}
	</button>
{/if}
