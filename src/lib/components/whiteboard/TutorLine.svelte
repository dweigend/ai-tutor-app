<script lang="ts">
	import { Icon, ReadAloud, animate, releaseAction, swipe, type Animation } from '$lib/modules';

	interface Px {
		x: number;
		y: number;
	}

	interface Props {
		text: string;
		demo: boolean;
		/** Highest and lowest ink point of the sketch in board pixels; null for an empty board. */
		anchorTop: Px | null;
		anchorBottom: Px | null;
		/** Free band for the plate: below the top controls, above the bottom row. */
		topLimit: number;
		bottomLimit: number;
		/** Width of the board in pixels. */
		width: number;
		onclose: () => void;
	}

	let { text, demo, anchorTop, anchorBottom, topLimit, bottomLimit, width, onclose }: Props =
		$props();

	const GAP = 16;
	let plateHeight = $state(0);
	let plateWidth = $state(0);
	let plate = $state<HTMLElement>();
	let offset = $state(0);
	let running: Animation | undefined;

	/*
	 * Above the sketch when there is room, else below it, else at the top over it without a line.
	 * The hairline points at a real ink point; the tutor never draws into the sketch.
	 */
	let layout = $derived.by(() => {
		const above = topLimit + GAP;
		if (!anchorTop || anchorTop.y - GAP >= above + plateHeight) {
			return { top: above, from: 'bottom' as const, to: anchorTop };
		}
		const below = bottomLimit - GAP - plateHeight;
		if (anchorBottom && anchorBottom.y + GAP <= below) {
			return { top: below, from: 'top' as const, to: anchorBottom };
		}
		return { top: above, from: 'bottom' as const, to: null };
	});

	let line = $derived.by(() => {
		const target = layout.to;
		if (!target || !plateWidth) return null;
		const plateLeft = plate?.offsetLeft ?? 0;
		const inset = GAP / 2;
		const x = Math.min(Math.max(target.x, plateLeft + inset), plateLeft + plateWidth - inset);
		const y = layout.from === 'bottom' ? layout.top + plateHeight : layout.top;
		return { x1: x + offset, y1: y, x2: target.x, y2: target.y };
	});

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

	/* Pushed aside in either direction, the plate leaves; short of the threshold it springs back. */
	const handlers = {
		onMove: (position: number) => {
			running?.stop();
			offset = position;
		},
		onRelease: (position: number, velocity: number) => {
			if (!releaseAction(position, velocity, plateWidth)) {
				moveTo(0, 'carry', velocity);
				return;
			}
			moveTo(Math.sign(position || velocity) * width, 'carry', velocity, onclose);
		},
		onCancel: () => moveTo(0, 'snap')
	};

	$effect(() => () => running?.stop());
</script>

{#if line}
	<svg class="tutor-hairline" aria-hidden="true">
		<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
	</svg>
{/if}

<ReadAloud.Scope>
	<section
		class="tutor-line"
		data-surface="white"
		aria-label="Rückfrage des Tutors"
		style:top="{layout.top}px"
		style:translate="{offset}px 0"
		bind:offsetHeight={plateHeight}
		bind:offsetWidth={plateWidth}
		bind:this={plate}
		{@attach swipe(handlers)}
	>
		<div class="tutor-head" data-row>
			<span class="m-label tutor-word">{demo ? 'TUTOR · DEMO' : 'TUTOR'}</span>
			<span class="tutor-keys">
				<ReadAloud.Trigger />
				<button type="button" class="m-icon-button" aria-label="Schließen" onclick={onclose}>
					<Icon name="close" />
				</button>
			</span>
		</div>
		<ReadAloud.Segment as="p" class="tutor-text">{text}</ReadAloud.Segment>
	</section>
</ReadAloud.Scope>

<style>
	.tutor-hairline {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.tutor-hairline line {
		stroke: var(--hairline);
		stroke-width: var(--hairline-width);
		shape-rendering: crispEdges;
	}

	/* A narrow plate; the instrument carries the one frame (DESIGN.md §2.2). */
	.tutor-line {
		position: absolute;
		inset-inline-start: var(--gutter);
		z-index: 5;
		inline-size: min(calc(100% - 2 * var(--gutter)), 26rem);
		border: var(--hairline-width) solid var(--hairline);
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}

	.tutor-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		block-size: var(--bar);
		padding-inline-start: var(--step-3);
	}

	.tutor-keys {
		display: flex;
		gap: var(--space-s);
		padding-inline-end: var(--step-3);
	}

	/* Tutor speech is Archivo 17 (DESIGN.md §6); Mono carries the word TUTOR. */
	.tutor-line :global(.tutor-text) {
		margin-inline: var(--step-3);
		padding-block-end: var(--step-3);
		font-size: var(--type-body);
		line-height: var(--line-body);
	}
</style>
