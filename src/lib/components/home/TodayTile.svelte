<script lang="ts">
	import Tile from '$lib/components/Tile.svelte';
	import { todayProgress } from './progress';

	interface Props {
		done: number;
		planned: number;
		href: string;
		/**
		 * The tile holds the bottom right corner of the screen, where the corner duck stands. Its
		 * link then ends beside the duck and no band runs below it. Leave it off anywhere else.
		 */
		clearDuckCorner?: boolean;
	}

	let { done, planned, href, clearDuckCorner = false }: Props = $props();
	let progress = $derived(todayProgress(done, planned));
	let steps = $derived(
		Array.from({ length: progress.target }, (_, index) => index < progress.completed)
	);

	/** The field above the duck belongs to the tile: a tap there opens the same link. */
	function openFromCap(event: MouseEvent & { currentTarget: HTMLElement }) {
		event.currentTarget.parentElement?.querySelector<HTMLAnchorElement>('a.tile')?.click();
	}
</script>

<!--
	The day without a word: one band per planned learning step, stacked from the ground up like
	building blocks. A finished step is a solid bar, an open one a thin rule. The bands start
	below the badge, so none runs through it. The link carries the figures for screen readers.

	With `clearDuckCorner` the tile is cut like an L: the corner of the duck stays free. The link
	is the column beside the duck, the cap is the field above it, and the bands are trimmed by the
	same cut.
-->
<div class="today" data-clear-duck={clearDuckCorner ? '' : undefined}>
	<span class="day" aria-hidden="true">
		{#each steps as finished, index (index)}
			<span class="step" data-done={finished ? '' : undefined}></span>
		{/each}
	</span>
	<Tile type="today" {href} ariaLabel={progress.label} />
	{#if clearDuckCorner}
		<span class="cap" aria-hidden="true" onclick={openFromCap}></span>
	{/if}
</div>

<style>
	.today {
		--tile: var(--type-today);
		--tile-text: var(--type-today-text);

		position: relative;
		display: grid;
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		min-inline-size: 0;
		min-block-size: 0;
		container: today / size;
	}

	.today[data-clear-duck] {
		grid-template:
			'link cap' minmax(0, 1fr)
			'link .' var(--duck-clearance) / minmax(0, 1fr) var(--corner-clearance);
	}

	/* The colour field and its bands lie below the link, which only adds badge and focus ring. */
	.day {
		/* Badge with its ring, and the padding of the tile head around it (Tile.svelte). */
		--head-pad: var(--space-m);

		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column-reverse;
		padding-block-start: calc(
			2 * var(--head-pad) + var(--sign-size) + 2 * var(--icon-stroke) + var(--edge-top, 0) *
				env(safe-area-inset-top, 0px)
		);
		background: var(--tile);
		pointer-events: none;
	}

	.today[data-clear-duck] .day {
		--cut-x: max(0px, calc(100% - var(--corner-clearance)));
		--cut-y: max(0px, calc(100% - var(--duck-clearance)));

		clip-path: polygon(
			0 0,
			100% 0,
			100% var(--cut-y),
			var(--cut-x) var(--cut-y),
			var(--cut-x) 100%,
			0 100%
		);
	}

	.today > :global(a.tile) {
		z-index: 1;
		background: transparent;
	}

	.today[data-clear-duck] > :global(a.tile) {
		grid-area: link;
	}

	.cap {
		z-index: 1;
		grid-area: cap;
		cursor: pointer;
	}

	.step {
		display: grid;
		flex: 1;
		align-items: center;
		min-block-size: 0;
	}

	.step::before {
		block-size: var(--edge-width);
		background: var(--tile-text);
		content: '';
	}

	.step[data-done]::before {
		block-size: 62%;
	}

	/* A small tile moves its badge closer to the corner (Tile.svelte); the bands follow. */
	@container today (max-width: 9.25rem) or (max-height: 7.5rem) {
		.day {
			--head-pad: var(--space-s);
		}
	}

	/* Beside the duck the link is narrower by the duck's column: 96px without a safe area. */
	@container today (max-width: calc(9.25rem + 96px)) {
		.today[data-clear-duck] .day {
			--head-pad: var(--space-s);
		}
	}

	@media (forced-colors: active) {
		.step::before {
			background: CanvasText;
		}
	}
</style>
