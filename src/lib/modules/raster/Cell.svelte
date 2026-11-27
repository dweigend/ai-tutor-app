<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../core/Icon.svelte';

	interface Props {
		/** Legend digit 1–4, Mono 11; omitted for keys and links. */
		legend?: string;
		selected?: boolean;
		children: Snippet;
	}

	let { legend, selected = false, children }: Props = $props();
</script>

{#if legend}<span class="raster-legend m-label" aria-hidden="true">{legend}</span>{/if}
<span class="raster-body">{@render children()}</span>
<span class="raster-sign" aria-hidden="true">
	{#if selected}<span class="m-selection-sign"><Icon name="check" size={20} /></span>{/if}
</span>
