<script module lang="ts">
	// Track whether the initial document hydration window has already been checked.
	let initialHydrationChecked = false;
</script>

<script lang="ts">
	import { gsap } from 'gsap';
	import type { Snippet } from 'svelte';

	interface Props {
		/** grid-template-areas on phones (2 columns). Without it tiles flow in order. */
		areas?: string;
		/** grid-template-areas from 900px (4 columns). Falls back to auto flow. */
		wideAreas?: string;
		/** grid-template-rows on phones. */
		rows?: string;
		/** grid-template-rows from 900px. */
		wideRows?: string;
		/** Stretch the grid to at least the viewport height. */
		fill?: boolean;
		/** Set the tiles down like building blocks on mount, bottom row first. */
		stack?: boolean;
		children: Snippet;
	}

	let { areas, wideAreas, rows, wideRows, fill = false, stack = false, children }: Props = $props();

	// Timing of the block stack: a short, accelerating drop that stops dead on contact.
	const DROP_SECONDS = 0.34;
	const BLOCK_STAGGER_SECONDS = 0.075;
	// Skip auto-drop if hydration completes long after initial paint so visible tiles never vanish.
	const AUTO_STACK_MAX_MS = 1500;

	let grid: HTMLDivElement;
	let matchMedia: gsap.MatchMedia | undefined;

	/**
	 * Bottom row first, then left to right: blocks rest on the ones below them. A block is a tile,
	 * or a wrapper that carries one with its controls (`data-stack-block`, start page).
	 */
	function blocksBottomUp(root: HTMLElement): HTMLElement[] {
		const tiles = Array.from(
			root.querySelectorAll<HTMLElement>(':scope > .tile, :scope > [data-stack-block]')
		);
		const placed = tiles.map((element) => ({ element, box: element.getBoundingClientRect() }));
		placed.sort((a, b) => b.box.bottom - a.box.bottom || a.box.left - b.box.left);
		return placed.map(({ element }) => element);
	}

	function buildStack(root: HTMLElement): void {
		const blocks = blocksBottomUp(root);
		gsap.set(blocks, { '--stack-inset': '100%' });
		const timeline = gsap.timeline();
		timeline.to(blocks, {
			'--stack-inset': '0%',
			duration: DROP_SECONDS,
			ease: 'power3.in',
			stagger: BLOCK_STAGGER_SECONDS,
			clearProps: '--stack-inset'
		});
	}

	/** An input during the entrance animation exposes every tile immediately. */
	export function finishEntrance(): void {
		matchMedia?.revert();
		matchMedia = undefined;
	}

	/** Plays the stack again from an empty grid; reverts immediately when reduced motion turns on. */
	export function replay(): void {
		finishEntrance();
		if (!stack) return;
		matchMedia = gsap.matchMedia(grid);
		matchMedia.add('(prefers-reduced-motion: no-preference)', () => {
			buildStack(grid);
		});
	}

	$effect(() => {
		if (!stack) return;
		const isInitialHydration = !initialHydrationChecked;
		initialHydrationChecked = true;
		const hydratedLate =
			isInitialHydration &&
			typeof performance !== 'undefined' &&
			performance.now() > AUTO_STACK_MAX_MS;
		if (!hydratedLate && document.visibilityState === 'visible') {
			replay();
		}
		return finishEntrance;
	});
</script>

<!-- Flush tiles: the 1px gap shows the --hairline ground as the one joint (DESIGN.md §2.2). -->
<div
	bind:this={grid}
	class="tile-grid"
	class:fill
	data-stack={stack ? 'active' : undefined}
	style:--areas={areas}
	style:--wide-areas={wideAreas}
	style:--rows={rows}
	style:--wide-rows={wideRows}
>
	{@render children()}
</div>

<style>
	.tile-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-template-areas: var(--areas, none);
		grid-template-rows: var(--rows, none);
		grid-auto-rows: minmax(8.5rem, auto);
		gap: var(--hairline-width);
		background: var(--hairline);
	}

	.fill {
		min-block-size: 100dvh;
	}

	/* The inset cancels the upward offset at the slot's top edge. */
	[data-stack] > :global([style*='--stack-inset:']) {
		transform: translateY(calc(-1 * var(--stack-inset)));
		clip-path: inset(var(--stack-inset) 0 0);
	}

	[data-stack] {
		overflow: clip;
	}

	@media (min-width: 900px) {
		.tile-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			grid-template-areas: var(--wide-areas, none);
			grid-template-rows: var(--wide-rows, none);
			grid-auto-rows: minmax(12rem, auto);
		}
	}
</style>
