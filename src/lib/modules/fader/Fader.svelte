<script lang="ts">
	import { Slider } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { animate, type Animation } from '../core/motion.js';
	import { magnetPosition, nearestDetent, share, stepDetent } from './scale.js';

	interface Props {
		min: number;
		max: number;
		/** Sorted detents from min to max; the committed value is always one of them. */
		detents: readonly number[];
		/** The committed detent. */
		value?: number;
		/** The grip while it moves (drag or spring); follows the finger, unlike `value`. */
		position?: number;
		/** Accessible name of the grip. */
		label: string;
		/** Spoken value, e.g. "Ja, 75 Prozent sicher". */
		valuetext: (value: number) => string;
		disabled?: boolean;
		/** Share of the axis kept free at each end, in percent of the width (Bits trackPadding). */
		padding?: number;
		class?: string;
		onvaluecommit?: (value: number) => void;
		/** Marks on the axis (ticks, a prediction mark), drawn inside the axis box. */
		children?: Snippet<[{ at: (value: number) => number }]>;
	}

	let {
		min,
		max,
		detents,
		value = $bindable(detents[0]),
		position = $bindable(value),
		label,
		valuetext,
		disabled = false,
		padding = 0,
		class: className,
		onvaluecommit,
		children
	}: Props = $props();

	let running: Animation | undefined;
	let dragging = $state(false);

	/* Fine steps let the grip follow the finger; the detent is chosen on release. */
	let fine = $derived((max - min) / 1000);
	let shown = $derived(dragging ? magnetPosition(position, detents) : position);

	/** Axis position of a value in percent, the same mapping Bits uses for the grip. */
	function at(target: number): number {
		return padding + share(target, min, max) * (100 - 2 * padding);
	}

	/* Objects spring (DESIGN.md §4.1): the grip settles with `snap`, a tap never overshoots. */
	function settle(target: number) {
		running?.stop();
		value = target;
		onvaluecommit?.(target);
		running = animate({
			from: position,
			to: target,
			preset: 'snap',
			restDelta: (max - min) / 2000,
			onUpdate: (next) => (position = next),
			onRest: () => (running = undefined)
		});
	}

	function drag(next: number) {
		// Bits UI echoes the value we set while the spring runs; only a real move stops it.
		if (running && Math.abs(next - position) <= fine) return;
		running?.stop();
		running = undefined;
		dragging = true;
		position = next;
	}

	function release(next: number) {
		dragging = false;
		settle(nearestDetent(next, detents));
	}

	const STEPS: Record<string, number> = {
		ArrowRight: 1,
		ArrowUp: 1,
		ArrowLeft: -1,
		ArrowDown: -1,
		PageUp: 3,
		PageDown: -3
	};

	/* Keys move one detent at a time; Home and End jump to the ends. */
	function keydown(event: KeyboardEvent) {
		if (disabled) return;
		let target: number | undefined;
		if (event.key in STEPS) target = stepDetent(value, detents, STEPS[event.key]);
		else if (event.key === 'Home') target = detents[0];
		else if (event.key === 'End') target = detents[detents.length - 1];
		if (target === undefined) return;
		event.preventDefault();
		settle(target);
	}

	$effect(() => () => running?.stop());
</script>

<!--
	P4 Fader: Bits UI Slider handles pointer input and ARIA. The grip is a 28px orange
	circle inside a 44px target.
-->
<Slider.Root
	type="single"
	{min}
	{max}
	step={fine}
	value={shown}
	onValueChange={drag}
	onValueCommit={release}
	trackPadding={padding || undefined}
	{disabled}
	class={['fader', className]}
	style="--fader-pad: {padding}%"
>
	<span class="fader-axis" aria-hidden="true">
		<span class="fader-line"></span>
		{@render children?.({ at })}
	</span>
	<Slider.Thumb
		index={0}
		class="fader-hit"
		aria-label={label}
		aria-valuetext={valuetext(value)}
		onkeydown={keydown}
	>
		<span class="fader-grip" data-grip></span>
	</Slider.Thumb>
</Slider.Root>
