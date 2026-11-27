<script lang="ts">
	import Value from '../readout/Value.svelte';
	import Fader from './Fader.svelte';
	import { evenDetents, nearestDetent, stepDetent } from './scale.js';

	interface Props {
		min: number;
		max: number;
		step: number;
		/** A long tick every `major` (a multiple of step); short ticks for every step otherwise. */
		major?: number;
		value?: number;
		/** Fixed --mark on the ruler, e.g. the learner's own prediction, held while stepping on. */
		mark?: number;
		/** Name of the quantity, e.g. `η`; also the unit shown next to the readout. */
		unit?: string;
		label: string;
		/** Text of a value with a decimal comma; defaults to the decimals of `step`. */
		format?: (value: number) => string;
		disabled?: boolean;
		onvaluecommit?: (value: number) => void;
	}

	let {
		min,
		max,
		step,
		major,
		value = $bindable(min),
		mark,
		unit,
		label,
		format,
		disabled = false,
		onvaluecommit
	}: Props = $props();

	let detents = $derived(evenDetents(min, max, step));
	let decimals = $derived(Math.max(0, (String(step).split('.')[1] ?? '').length));
	let text = $derived(
		(target: number) => format?.(target) ?? target.toFixed(decimals).replace('.', ',')
	);
	let position = $state(value);

	function isMajor(detent: number): boolean {
		if (!major) return false;
		const ratio = (detent - min) / major;
		return Math.abs(ratio - Math.round(ratio)) < 1e-6;
	}

	function nudge(steps: number) {
		const next = stepDetent(value, detents, steps);
		value = next;
		position = next;
		onvaluecommit?.(next);
	}
</script>

<!--
	ScaleFader recipe (konzept M5): a ruler, not a dial. Hairline with short and long ticks, the
	orange grip, a fixed --mark for one's own prediction, − and + keys and a Mono readout that
	ticks (DESIGN.md §4.1). Ready for #14 (η in the valley).
-->
<div class="scale-fader">
	<div class="scale-fader-head">
		<button
			type="button"
			class="m-hit m-key m-keyword"
			aria-label="{label} verringern"
			disabled={disabled || value <= min}
			onclick={() => nudge(-1)}
		>
			−
		</button>
		<Value value={text(nearestDetent(position, detents))} {unit} />
		<button
			type="button"
			class="m-hit m-key m-keyword"
			aria-label="{label} erhöhen"
			disabled={disabled || value >= max}
			onclick={() => nudge(1)}
		>
			+
		</button>
	</div>
	<Fader
		{min}
		{max}
		{detents}
		bind:value
		bind:position
		{label}
		valuetext={(target) => `${unit ? `${unit} ` : ''}${text(target)}`}
		padding={6}
		{disabled}
		{onvaluecommit}
	>
		{#snippet children({ at })}
			{#each detents as detent (detent)}
				<span
					class="fader-tick"
					data-major={isMajor(detent) || undefined}
					style:left="{at(detent)}%"
				></span>
			{/each}
			{#if mark !== undefined}
				<span class="scale-fader-mark" style:left="{at(mark)}%"></span>
			{/if}
		{/snippet}
	</Fader>
</div>
