<script lang="ts">
	import { Button } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { MotifImage, TileGraphic, type MotifId } from '$lib/art';
	import { TypeBadge } from '$lib/modules';
	import type { TileGraphicId, TileType } from '$lib/navigation';
	import type { Surface } from '$lib/styles/surface';

	/**
	 * A start tile (issue #58): one flat field in its type colour, the TypeBadge with at most one
	 * line of three words below it in the top left corner, and one picture or graphic that fills
	 * the tile. The type is told by badge and colour alone. Signal yellow is never a tile colour.
	 */
	interface Props {
		type: TileType;
		/** The one visible line, at most three words. Without it the tile is a pure graphic. */
		title?: string;
		href: string;
		/** Accessible name of the link; it contains the visible title. */
		ariaLabel: string;
		/** A full-bleed picture. Its top left zone must be calm enough for badge and word. */
		art?: MotifId;
		/** A flat graphic in the tile's colour pair. */
		graphic?: TileGraphicId;
		/** An own full-bleed graphic, used by the day tile. */
		children?: Snippet;
		/** A topic from the learning queue: a dot raster sets it apart from the fixed areas. */
		queued?: boolean;
		/** Load the picture before the others (the largest tile). */
		priority?: boolean;
		/** `sizes` for the picture's srcset: the tile's rendered width per format. */
		sizes?: string;
		/** Id of a hint for screen readers, e.g. how to reorder with the keyboard. */
		ariaDescribedby?: string;
		/** Key combinations the surrounding page handles for this tile. */
		ariaKeyshortcuts?: string;
		onclick?: (event: MouseEvent) => void;
		onkeydown?: (event: KeyboardEvent) => void;
	}

	let {
		type,
		title,
		href,
		ariaLabel,
		art,
		graphic,
		children,
		queued = false,
		priority = false,
		sizes = '100vw',
		ariaDescribedby,
		ariaKeyshortcuts,
		onclick,
		onkeydown
	}: Props = $props();

	/*
	 * The nearest surface set: it gives controls on the tile their roles and the browser bar its
	 * colour (surface.ts). The tile itself paints its type colour.
	 */
	const SURFACES: Record<TileType, Surface> = {
		exercise: 'orange',
		explanation: 'ink',
		magazine: 'crimson',
		whiteboard: 'ink',
		activity: 'ink',
		today: 'ink'
	};
</script>

<Button.Root
	{href}
	{onclick}
	{onkeydown}
	class="tile tile-link"
	style="--tile: var(--type-{type}); --tile-text: var(--type-{type}-text)"
	data-type={type}
	data-surface={SURFACES[type]}
	data-queued={queued ? '' : undefined}
	aria-label={ariaLabel}
	aria-describedby={ariaDescribedby}
	aria-keyshortcuts={ariaKeyshortcuts}
	draggable="false"
>
	{#if art || graphic || children}
		<span class="tile-media" data-media="bleed" data-graphic={art ? undefined : graphic}>
			{#if art}
				<span class="tile-art">
					<MotifImage motif={art} {sizes} {priority} position="0% 50%" alt="" />
				</span>
			{:else if graphic}
				<TileGraphic kind={graphic} />
			{:else}
				{@render children?.()}
			{/if}
		</span>
	{/if}
	<span class="tile-head">
		<span class="tile-badge"><TypeBadge {type} /></span>
		{#if title}<span class="tile-word">{title}</span>{/if}
	</span>
</Button.Root>

<style>
	/* Global because Button.Root renders the anchor outside this component's scope. */
	:global(a.tile) {
		position: relative;
		display: grid;
		min-inline-size: 0;
		min-block-size: 0;
		overflow: hidden;
		container: tile / size;
		background: var(--tile);
		color: var(--tile-text);
		text-decoration: none;
		isolation: isolate;
		border-radius: var(--radius-flat);
		cursor: pointer;
		/* A long press lifts the tile, so no iOS link preview or text selection. */
		-webkit-touch-callout: none;
		user-select: none;
		-webkit-user-select: none;
	}

	/*
	 * A queued topic carries a fine dot raster in its text colour, so it never reads as one field
	 * with the area tile of the same colour next to it. The graphic is drawn over the raster.
	 */
	:global(a.tile[data-queued]) {
		background-image: radial-gradient(
			circle,
			color-mix(in srgb, var(--tile-text) 30%, transparent) 1px,
			transparent 1.5px
		);
		background-size: 10px 10px;
	}

	/* The ground of the tile shows while a picture loads (DESIGN.md §8.5). */
	.tile-media {
		z-index: -1;
		min-inline-size: 0;
		min-block-size: 0;
		overflow: clip;
	}

	/*
	 * The board graphic docks a white sheet below the head and still counts with a word beside
	 * the badge (TileGraphic.svelte). The word now stands below the badge, so on a wide tile the
	 * sheet starts one word line lower. A narrow tile was stacked before and keeps its inset.
	 */
	.tile-media[data-graphic='board'] {
		padding-block-start: calc(var(--type-body) * var(--line-title) + var(--space-s));
	}

	@container tile (max-width: 9.25rem) {
		.tile-media[data-graphic='board'] {
			padding-block-start: 0;
		}
	}

	/*
	 * A picture is drawn larger than its tile and anchored at the bottom left, so its motif
	 * leaves the top left corner to badge and word at every tile size.
	 */
	.tile-media:has(.tile-art) {
		position: relative;
	}

	.tile-art {
		position: absolute;
		inset: -40% -25% 0 0;
	}

	/*
	 * Badge and word share the top left corner on every tile, always stacked: the badge above its
	 * word. So a wide and a narrow tile read alike. The bottom right corner stays free of text, so
	 * the corner duck never covers a label. `--edge-top` and `--edge-left` are 1 on tiles at the
	 * screen edge (TileGrid) and keep the head out of the safe area.
	 */
	.tile-head {
		--head-pad: var(--space-m);

		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: calc(var(--space-s) / 2);
		max-inline-size: 100%;
		padding: var(--head-pad);
		padding-block-start: calc(var(--head-pad) + var(--edge-top, 0) * env(safe-area-inset-top, 0px));
		padding-inline-start: calc(
			var(--head-pad) + var(--edge-left, 0) * env(safe-area-inset-left, 0px)
		);
	}

	/* The ring keeps the badge a badge on a field of its own colour. */
	.tile-badge {
		display: grid;
		flex: none;
		border: var(--icon-stroke) solid currentColor;
		border-radius: 50%;
	}

	/* The word is never underlined, also not under the pointer: focus shows as the two rings. */
	.tile-word {
		max-inline-size: 100%;
		overflow: hidden;
		font: var(--font-weight-strong) var(--type-body) / var(--line-title) var(--font-ui);
		white-space: nowrap;
		text-overflow: ellipsis;
		text-decoration: none;
	}

	/* A narrow or a low tile moves badge and word closer to the corner; the word gets smaller. */
	@container tile (max-width: 9.25rem) {
		.tile-head {
			--head-pad: var(--space-s);
		}

		.tile-word {
			font-size: var(--type-meta);
		}
	}

	/* On a small tile the word takes most of the width: the picture gives it the whole band. */
	@container tile (max-width: 15rem) {
		.tile-art {
			inset-block-start: -80%;
		}
	}

	@container tile (max-height: 7.5rem) {
		.tile-head {
			--head-pad: var(--space-s);
		}
	}

	/* Two rings, ink outside and white inside, so focus reads on every colour and picture. */
	:global(a.tile:focus-visible) {
		outline: var(--focus-width) solid var(--palette-ink);
		outline-offset: calc(-1 * var(--focus-width));
	}

	:global(a.tile:focus-visible)::after {
		position: absolute;
		inset: var(--focus-width);
		border: var(--focus-width) solid var(--palette-white);
		content: '';
		pointer-events: none;
	}
</style>
