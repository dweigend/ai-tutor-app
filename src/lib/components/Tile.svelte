<script lang="ts">
	import { Button } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { MotifImage, type MotifId } from '$lib/art';
	import { Icon, type IconName } from '$lib/modules';
	import type { LabelCorner, LabelTone, TileTone } from '$lib/navigation';

	interface Editorial {
		category: string;
		title: string;
		subtitle?: string;
		subtitleId?: string;
		icon?: IconName;
	}

	interface Props {
		/** A short floating label for tiles without an editorial footer. */
		title?: string;
		/** Surface colour; under an image it is the colour shown while the image loads. */
		tone?: TileTone;
		/** Full-bleed motif. Its calm zone must hold the label at 4.5:1 or more. */
		art?: MotifId;
		editorial?: Editorial;
		media?: Snippet;
		/** Load the motif before the others (the largest tile above the fold). */
		priority?: boolean;
		/** `sizes` for the motif's srcset: the tile's rendered width per breakpoint. */
		sizes?: string;
		/** Defaults to the text pair of the tone. */
		labelTone?: LabelTone;
		labelCorner?: LabelCorner;
		/** Link mode: the whole tile becomes one bits-ui Button.Root anchor. */
		href?: string;
		/** Accessible name of the link; must start with the visible title when there is one. */
		ariaLabel?: string;
		/** Id of a hint for screen readers, e.g. how to reorder with the keyboard. */
		ariaDescribedby?: string;
		/** Key combinations the surrounding page handles for this tile. */
		ariaKeyshortcuts?: string;
		/** Named grid-area or grid-area shorthand inside a TileGrid. */
		area?: string;
		/** Render the label as a heading, for tiles that head a section. */
		headingLevel?: 2 | 3;
		/** The page this tile leads to is open: `■` in the corner opposite the label, aria-current. */
		current?: boolean;
		/** Centered graphic between the corners, used by the today tile. */
		children?: Snippet;
		onclick?: (event: MouseEvent) => void;
		onkeydown?: (event: KeyboardEvent) => void;
	}

	let {
		title,
		tone = 'paper',
		art,
		editorial,
		media,
		priority = false,
		sizes = '50vw',
		labelTone,
		labelCorner = 'top-left',
		href,
		ariaLabel,
		ariaDescribedby,
		ariaKeyshortcuts,
		area,
		headingLevel,
		current = false,
		children,
		onclick,
		onkeydown
	}: Props = $props();

	const LIGHT_TONES: readonly TileTone[] = ['ink', 'crimson'];

	let resolvedLabelTone = $derived<LabelTone>(
		labelTone ?? (LIGHT_TONES.includes(tone) ? 'light' : 'dark')
	);
	let variant = $derived(editorial ? 'editorial' : art ? 'image' : children ? 'graphic' : 'tone');
	let classes = $derived(`tile${href ? ' tile-link' : ''}`);
</script>

{#snippet body()}
	{#if art || media}
		<span class="tile-art">
			{#if art}<MotifImage motif={art} {sizes} {priority} alt="" />{/if}
			{@render media?.()}
		</span>
	{/if}
	{#if editorial}
		<span class="editorial">
			<span class="editorial-category">{editorial.category}</span>
			{#if editorial.icon}
				<span class="editorial-icon"><Icon name={editorial.icon} size={18} /></span>
			{/if}
			<span class="editorial-title">{editorial.title}</span>
			{#if editorial.subtitle}
				<span class="editorial-subtitle" id={editorial.subtitleId}>{editorial.subtitle}</span>
			{/if}
		</span>
	{/if}
	{#if children}
		<span class="tile-graphic">{@render children()}</span>
	{/if}
	{#if title}
		<svelte:element
			this={headingLevel ? `h${headingLevel}` : 'span'}
			class="tile-label {labelCorner} {resolvedLabelTone}"
		>
			{title}
		</svelte:element>
	{/if}
	{#if current}
		<!-- JetBrains Mono ■ means "chosen" (DESIGN.md §2.4, §7); aria-current carries the state. -->
		<span class="tile-current {resolvedLabelTone}" aria-hidden="true">■</span>
	{/if}
{/snippet}

{#if href}
	<Button.Root
		{href}
		{onclick}
		{onkeydown}
		class={classes}
		data-surface={tone}
		aria-label={ariaLabel}
		aria-describedby={ariaDescribedby}
		aria-keyshortcuts={ariaKeyshortcuts}
		aria-current={current ? 'page' : undefined}
		data-current={current ? '' : undefined}
		data-variant={variant}
		draggable="false"
		style={area ? `grid-area: ${area}` : undefined}
	>
		{@render body()}
	</Button.Root>
{:else}
	<div class={classes} data-surface={tone} data-variant={variant} style:grid-area={area}>
		{@render body()}
	</div>
{/if}

<style>
	/* Global because Button.Root renders the anchor outside this component's scope. */
	:global(.tile) {
		--tile-pad: var(--step-3);

		position: relative;
		display: block;
		min-inline-size: 0;
		min-block-size: 0;
		overflow: hidden;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		isolation: isolate;
		border-radius: var(--radius-flat);
		/* A long press lifts the tile (issue #10), so no iOS link preview or text selection. */
		-webkit-touch-callout: none;
		user-select: none;
		-webkit-user-select: none;
	}

	@media (min-width: 900px) {
		:global(.tile) {
			--tile-pad: var(--step-5);
		}
	}

	.tile-art {
		position: absolute;
		inset: 0;
		z-index: -1;
		min-inline-size: 0;
		min-block-size: 0;
		overflow: clip;
	}

	:global(.tile[data-variant='editorial']) {
		display: grid;
		grid-template-rows: 1fr auto;
	}

	:global(.tile[data-variant='editorial']) .tile-art {
		position: relative;
		grid-row: 1;
	}

	.editorial {
		grid-row: 2;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.25rem var(--space-s);
		padding: var(--space-s) var(--tile-pad) 0.75rem;
		color: var(--palette-ink);
		background: var(--palette-paper);
		font-family: var(--font-ui);
	}

	.editorial-category {
		grid-column: 1;
		font: 600 0.75rem / 1.25 var(--font-ui);
		letter-spacing: 0.035em;
		text-transform: uppercase;
		color: var(--palette-ink-muted);
	}

	.editorial-title {
		grid-column: 1 / -1;
		font-size: var(--type-body);
		line-height: 1.12;
		font-weight: 650;
		overflow-wrap: anywhere;
	}

	.editorial:has(.editorial-icon) .editorial-title {
		grid-column: 1;
		font-size: clamp(1.125rem, 2.4vw, 1.75rem);
		letter-spacing: -0.025em;
	}

	.editorial-icon {
		grid-area: 1 / 2 / span 2;
		display: grid;
		place-items: center;
		inline-size: 2rem;
		block-size: 2rem;
		border-radius: 50%;
		background: var(--palette-signal-yellow);
	}

	.editorial-subtitle {
		grid-column: 1 / -1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: clamp(0.75rem, 1.05vw, 0.875rem);
		line-height: 1.3;
		color: var(--palette-ink-muted);
	}

	@media (hover: hover) {
		:global(.tile-link:hover) .editorial-title {
			text-decoration: underline;
			text-underline-offset: 0.14em;
		}
	}

	/* Flex, not grid: a definite box lets the graphic size itself in percent of the free space. */
	.tile-graphic {
		position: absolute;
		inset: var(--tile-pad);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Cell title (DESIGN.md §6): Archivo 600, 17px. One word, free in its calm zone. */
	.tile-label {
		position: absolute;
		margin: 0;
		font: 600 var(--type-body) / 1 var(--font-sans);
		white-space: nowrap;
		text-box: trim-both cap alphabetic;
		text-decoration: underline transparent;
		text-decoration-thickness: var(--focus-width);
		text-underline-offset: 0.14em;
		transition: text-decoration-color var(--change-time) var(--change-easing);
	}

	.tile-current {
		position: absolute;
		inset-block-start: var(--tile-pad);
		inset-inline-end: var(--tile-pad);
		font: 500 var(--type-body) / 1 var(--font-mono);
		text-box: trim-both cap alphabetic;
	}

	.top-left {
		inset-block-start: var(--tile-pad);
		inset-inline-start: var(--tile-pad);
	}

	.top-right {
		inset-block-start: var(--tile-pad);
		inset-inline-end: var(--tile-pad);
	}

	.bottom-left {
		inset-block-end: var(--tile-pad);
		inset-inline-start: var(--tile-pad);
	}

	.bottom-right {
		inset-block-end: var(--tile-pad);
		inset-inline-end: var(--tile-pad);
	}

	.dark {
		color: var(--palette-ink);
	}

	.light {
		color: var(--palette-white);
	}

	:global(.tile-link) {
		cursor: pointer;
	}

	@media (hover: hover) {
		:global(.tile-link:hover) .tile-label {
			text-decoration-color: currentColor;
		}
	}

	/* Two rings, ink outside and white inside, so focus reads on every motif. */
	:global(.tile-link:focus-visible) {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	:global(.tile-link:focus-visible)::after {
		position: absolute;
		inset: var(--focus-width);
		border: var(--focus-width) solid var(--focus-halo);
		content: '';
		pointer-events: none;
	}

	:global(.tile-link:focus-visible) .tile-label {
		text-decoration-color: currentColor;
	}
</style>
