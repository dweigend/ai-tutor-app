<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Columns and rows of one bento template (home/bento.ts). */
	interface Template {
		columns: number;
		rows: number;
	}

	interface Props {
		/** Template while the screen is taller than wide. */
		portrait: Template;
		/** Template while the screen is wider than tall. */
		landscape: Template;
		children: Snippet;
	}

	let { portrait, landscape, children }: Props = $props();
</script>

<!--
	The bento grid of the start page: it fills its canvas exactly, so every tile fits on one
	screen. Each child names its cell for both formats in `--portrait-area` and
	`--landscape-area`, and with `--portrait-top`, `--portrait-left`, `--landscape-top` and
	`--landscape-left` (0 or 1) whether it touches that screen edge. The 1px gap shows the paper
	ground as the one joint (DESIGN.md §2.2).
-->
<div
	class="tile-grid"
	style:--portrait-columns={portrait.columns}
	style:--portrait-rows={portrait.rows}
	style:--landscape-columns={landscape.columns}
	style:--landscape-rows={landscape.rows}
>
	{@render children()}
</div>

<style>
	.tile-grid {
		display: grid;
		grid-template-columns: repeat(var(--portrait-columns), minmax(0, 1fr));
		grid-template-rows: repeat(var(--portrait-rows), minmax(0, 1fr));
		gap: var(--hairline-width);
		inline-size: 100%;
		block-size: 100%;
		background: var(--palette-paper);
	}

	.tile-grid > :global(*) {
		--edge-top: var(--portrait-top, 0);
		--edge-left: var(--portrait-left, 0);

		grid-area: var(--portrait-area);
	}

	@media (orientation: landscape) {
		.tile-grid {
			grid-template-columns: repeat(var(--landscape-columns), minmax(0, 1fr));
			grid-template-rows: repeat(var(--landscape-rows), minmax(0, 1fr));
		}

		.tile-grid > :global(*) {
			--edge-top: var(--landscape-top, 0);
			--edge-left: var(--landscape-left, 0);

			grid-area: var(--landscape-area);
		}
	}
</style>
