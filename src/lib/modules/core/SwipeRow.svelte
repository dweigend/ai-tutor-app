<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { animate, type Animation } from './motion.js';
	import { directionOf, isArmed, releaseAction, swipe, type SwipeAction } from './swipe.js';

	interface Props {
		/** Name of the offer, used in the key names and the undo line. */
		name: string;
		/** Row content; the row is one cell (--cell) high. */
		children: Snippet;
		onaction?: (action: SwipeAction) => void;
		onundo?: (action: SwipeAction) => void;
		/**
		 * Inside a Raster the row brings neither its own gutter nor its own joint: the cell pads
		 * itself and the Raster draws the 1px joint.
		 */
		flush?: boolean;
	}

	let { name, children, onaction, onundo, flush = false }: Props = $props();

	const WORD: Record<SwipeAction, string> = { later: 'Später', dismiss: 'Weg' };

	let width = $state(0);
	let offset = $state(0);
	let committed = $state<SwipeAction | null>(null);
	let fromKeys = false;
	let running: Animation | undefined;
	let undoButton = $state<HTMLButtonElement>();
	let laterKey = $state<HTMLButtonElement>();

	let direction = $derived(directionOf(offset));
	let armed = $derived(isArmed(offset, width));

	function moveTo(target: number, preset: 'snap' | 'carry', velocity = 0, onRest?: () => void) {
		running?.stop();
		running = animate({
			from: offset,
			to: target,
			preset,
			velocity,
			onUpdate: (position) => (offset = position),
			onRest
		});
	}

	function commit(action: SwipeAction) {
		running = undefined;
		committed = action;
		onaction?.(action);
		if (fromKeys) void tick().then(() => undoButton?.focus());
	}

	function release(position: number, velocity: number) {
		const action = releaseAction(position, velocity, width);
		if (!action) {
			moveTo(0, 'carry', velocity);
			return;
		}
		fromKeys = false;
		moveTo(Math.sign(position) * width, 'carry', velocity, () => commit(action));
	}

	/** Keys never overshoot: a tap is not a throw (DESIGN.md §4.4). */
	function press(action: SwipeAction) {
		fromKeys = true;
		const target = action === 'later' ? width : -width;
		moveTo(target, 'snap', 0, () => commit(action));
	}

	async function undo() {
		const action = committed;
		if (!action) return;
		committed = null;
		onundo?.(action);
		moveTo(0, 'snap');
		if (!fromKeys) return;
		await tick();
		laterKey?.focus();
	}

	const handlers = {
		onMove: (position: number) => {
			running?.stop();
			offset = position;
		},
		onRelease: release,
		onCancel: () => moveTo(0, 'snap')
	};

	$effect(() => () => running?.stop());
</script>

<!--
	The undo line has no timer (Art-Director-Auflage #1): it stays until the learner undoes or acts
	elsewhere. The list that holds the row ends it by remounting the row (SlabList generations).
-->
<div class="swipe-row" data-flush={flush || undefined} bind:clientWidth={width}>
	<div class="swipe-live" aria-live="polite">
		{#if committed}
			<div
				class="swipe-undo swipe-undo-{committed}"
				data-row
				data-surface={committed === 'dismiss' ? 'crimson' : undefined}
			>
				<p class="swipe-undo-text">
					<span class="m-label">{WORD[committed]}</span>
					<span class="swipe-undo-name">{name}</span>
				</p>
				<button
					bind:this={undoButton}
					type="button"
					class="m-hit m-keyword swipe-undo-key"
					onclick={undo}
				>
					Rückgängig
				</button>
			</div>
		{/if}
	</div>

	{#if !committed}
		<div class="swipe-track" data-direction={direction} data-armed={armed}>
			<div class="swipe-under swipe-under-later" aria-hidden="true">
				<span class="m-label swipe-word">{WORD.later}</span>
			</div>
			<div class="swipe-under swipe-under-dismiss" data-surface="crimson" aria-hidden="true">
				<span class="m-label swipe-word">{WORD.dismiss}</span>
			</div>
			<div class="swipe-cell" data-row style:translate="{offset}px 0" {@attach swipe(handlers)}>
				<div class="swipe-content">{@render children()}</div>
				<div class="swipe-keys" role="group" aria-label="Aktionen für {name}">
					<button
						bind:this={laterKey}
						type="button"
						class="m-hit m-key m-keyword"
						aria-label="{WORD.later}: {name}"
						onclick={() => press('later')}
					>
						{WORD.later}
					</button>
					<button
						type="button"
						class="m-hit m-key m-keyword"
						aria-label="{WORD.dismiss}: {name}"
						onclick={() => press('dismiss')}
					>
						{WORD.dismiss}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.swipe-row {
		position: relative;
		min-block-size: var(--cell);
		border-block-end: var(--hairline-width) solid var(--hairline);
	}

	.swipe-row[data-flush] {
		border-block-end: 0;
	}

	.swipe-row[data-flush] .swipe-content {
		padding-inline: 0;
	}

	.swipe-track {
		position: relative;
		overflow: hidden;
	}

	/* The layer under the cell: yellow means "mine, for later", crimson means "away". */
	.swipe-under {
		position: absolute;
		inset: 0;
		display: none;
		align-items: center;
		padding-inline: var(--gutter);
	}

	.swipe-under-later {
		background: var(--mark);
		color: var(--mark-text);
	}

	.swipe-under-dismiss {
		justify-content: flex-end;
	}

	[data-direction='later'] .swipe-under-later,
	[data-direction='dismiss'] .swipe-under-dismiss {
		display: flex;
	}

	.swipe-word {
		display: inline-grid;
		place-items: center;
		min-block-size: var(--hit);
		padding-inline: var(--step-3);
	}

	/* Past the threshold the word inverts like a pressed key: a hard switch, no tween. */
	[data-armed='true'] .swipe-under-later .swipe-word {
		background: var(--mark-text);
		color: var(--mark);
	}

	[data-armed='true'] .swipe-under-dismiss .swipe-word {
		background: var(--text);
		color: var(--surface);
	}

	.swipe-cell {
		position: relative;
		display: flex;
		align-items: center;
		min-block-size: var(--cell);
		background: var(--surface);
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}

	.swipe-content {
		flex: 1;
		min-inline-size: 0;
		padding-inline: var(--gutter);
	}

	/* Keys for keyboard and screen readers; they appear while one of them has focus. */
	.swipe-keys {
		position: absolute;
		inset-block: 0;
		inset-inline-end: 0;
		display: flex;
	}

	.swipe-keys:not(:focus-within) {
		clip-path: inset(50%);
	}

	.swipe-keys .m-hit {
		min-inline-size: var(--cell);
		padding-inline: var(--step-3);
		border-inline-start: var(--hairline-width) solid var(--hairline);
	}

	.swipe-undo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--step-3);
		min-block-size: var(--cell);
		padding-inline-start: var(--gutter);
	}

	.swipe-undo-text {
		display: flex;
		align-items: baseline;
		gap: var(--step-3);
		min-inline-size: 0;
		font-size: var(--type-body);
	}

	.swipe-undo-name {
		overflow-wrap: anywhere;
	}

	/* Later reads as "mine": the --mark plate; its key is the inverted plate. */
	.swipe-undo-later {
		background: var(--mark);
		color: var(--mark-text);
	}

	.swipe-undo-key {
		align-self: stretch;
		padding-inline: var(--step-4);
		background: var(--action);
		color: var(--action-text);
	}

	.swipe-undo-later .swipe-undo-key {
		background: var(--mark-text);
		color: var(--mark);
	}

	.swipe-undo-key:active {
		background: transparent;
		color: inherit;
	}
</style>
