<script lang="ts">
	import type { TileGraphicId } from '$lib/navigation';

	/**
	 * Flat graphics for start tiles (issue #58): one bold shape that says what the tile holds,
	 * without a sentence. Each one fills its tile at every size and is drawn in the tile's colour
	 * pair (`--tile`, `--tile-text`) plus ink and white. The top left corner stays calm for the
	 * badge and the one word of the tile.
	 */
	let { kind }: { kind: TileGraphicId } = $props();
</script>

<span class="graphic" data-graphic={kind} aria-hidden="true">
	{#if kind === 'valley'}
		<!-- The valley of the explanations with its ball at the lowest point. -->
		<svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
			<path class="ground" d="M0 36 C24 40 36 84 60 84 S90 62 100 54 V100 H0 Z" />
		</svg>
		<span class="ball"></span>
	{:else if kind === 'board'}
		<!-- A white board docked to the right and bottom edge: axes, one marker stroke, the pen. -->
		<span class="sheet">
			<svg viewBox="0 0 120 90" focusable="false">
				<path class="axis" d="M16 10 V74 H110" vector-effect="non-scaling-stroke" />
				<path class="stroke" d="M16 62 C34 62 40 22 58 26 S76 60 96 24" />
				<circle class="node" cx="16" cy="62" r="3.5" />
				<circle class="node" cx="58" cy="26" r="3.5" />
				<g transform="translate(96 24) rotate(-45)">
					<path class="pen" d="M0 0 L7 -3.5 H28 V3.5 H7 Z" />
					<path class="band" d="M12 -3.5 H17 V3.5 H12 Z" />
				</g>
			</svg>
		</span>
	{:else if kind === 'pulse'}
		<!-- One beat in a calm line. -->
		<svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
			<polyline
				class="trace"
				points="0,68 62,68 70,44 80,92 88,68 100,68"
				vector-effect="non-scaling-stroke"
			/>
		</svg>
	{:else if kind === 'fader'}
		<!-- The fader of an exercise: one track, one round grip. -->
		<span class="track"></span>
		<span class="grip"></span>
	{:else}
		<!-- Lines of a page that run off the right edge. -->
		<svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
			<path class="lines" d="M36 50 H100 V58 H36 Z M36 66 H100 V74 H36 Z M36 82 H76 V90 H36 Z" />
		</svg>
	{/if}
</span>

<style>
	.graphic {
		position: relative;
		display: block;
		inline-size: 100%;
		block-size: 100%;
		pointer-events: none;
	}

	.graphic > svg {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
	}

	.ground {
		fill: var(--palette-ink);
	}

	/* The valley floor lies at 60 % / 84 % of the tile, so the ball rests exactly on it. */
	.ball {
		position: absolute;
		inset-block-end: 16%;
		inset-inline-start: 60%;
		inline-size: clamp(1rem, 20cqmin, 5rem);
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--tile-text);
		translate: -50% 0;
	}

	/* Below the badge and the word; the insets follow the three head sizes of Tile.svelte. */
	.sheet {
		position: absolute;
		inset: 3.75rem 0 0 var(--space-m);
		display: grid;
		background: var(--palette-white);
	}

	.sheet svg {
		inline-size: 100%;
		block-size: 100%;
		min-block-size: 0;
	}

	.axis {
		fill: none;
		stroke: var(--palette-ink);
		stroke-width: var(--icon-stroke);
	}

	.stroke {
		fill: none;
		stroke: var(--tile);
		stroke-width: 5;
		stroke-linecap: round;
	}

	.node,
	.pen {
		fill: var(--palette-ink);
	}

	.band {
		fill: var(--tile);
	}

	.trace {
		fill: none;
		stroke: var(--tile-text);
		stroke-width: 8px;
		stroke-linejoin: round;
	}

	.track {
		position: absolute;
		inset-block-start: 62%;
		inset-inline: 0;
		block-size: var(--edge-width);
		background: var(--palette-ink);
		translate: 0 -50%;
	}

	.grip {
		position: absolute;
		inset-block-start: 62%;
		inset-inline-start: 66%;
		inline-size: clamp(1.75rem, 30cqmin, 7rem);
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--palette-ink);
		translate: -50% -50%;
	}

	.lines {
		fill: var(--tile-text);
	}

	@container tile (max-width: 9.25rem) {
		.sheet {
			inset: 4.5rem 0 0 var(--space-s);
		}
	}

	@container tile (max-height: 7.5rem) {
		.sheet {
			inset: 2.75rem 0 0 var(--space-s);
		}
	}
</style>
