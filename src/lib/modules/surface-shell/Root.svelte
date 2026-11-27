<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Surface } from './surfaces.js';

	interface Props {
		/** The surface of the whole screen; the bar shares it, without a dividing line. */
		tone: Surface;
		children: Snippet;
	}

	let { tone, children }: Props = $props();
</script>

<div class="shell" data-surface={tone}>
	{@render children()}
</div>

<style>
	.shell {
		min-block-size: var(--shell-min-height, 100dvh);
		padding-block-start: env(safe-area-inset-top);
	}
</style>
