<script lang="ts">
	import type { NumberRange } from '$lib/content/types';

	interface Props {
		label: string;
		value: number;
		range: NumberRange;
		/** Formatted current value shown next to the label. */
		display: string;
		disabled?: boolean;
		/** Spoken value when the visible one is a formula, e.g. "h = 10 hoch minus 3". */
		valueText?: string;
	}

	let { label, value = $bindable(), range, display, disabled = false, valueText }: Props = $props();
	const id = $props.id();
</script>

<!-- Label and output sit beside the input, not around it: a wrapping label would bind to the
     output (its first labelable descendant) and leave the range input without a name. -->
<div class="slider" class:disabled>
	<span class="slider-head">
		<label class="label" for={id}>{label}</label>
		<output class="data" for={id}>{display}</output>
	</span>
	<input
		{id}
		type="range"
		min={range.min}
		max={range.max}
		step={range.step}
		bind:value
		{disabled}
		aria-valuetext={valueText ?? display}
	/>
	<span class="scale data muted" aria-hidden="true">
		<span>{range.min}</span><span>{range.max}</span>
	</span>
</div>

<style>
	.slider {
		display: grid;
		gap: var(--step-1);
	}

	.slider-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--step-3);
	}

	.slider-head .data {
		font-size: var(--type-label);
	}

	.scale {
		display: flex;
		justify-content: space-between;
	}

	input {
		inline-size: 100%;
		block-size: var(--hit);
		margin: 0;
		background: transparent;
		cursor: pointer;
		appearance: none;
	}

	input::-webkit-slider-runnable-track {
		block-size: var(--space-s);
		border-radius: var(--radius-pill);
		background: var(--well);
	}

	input::-moz-range-track {
		block-size: var(--space-s);
		border-radius: var(--radius-pill);
		background: var(--well);
	}

	input::-webkit-slider-thumb {
		inline-size: var(--grip-size);
		block-size: var(--grip-size);
		margin-block-start: calc((var(--space-s) - var(--grip-size)) / 2);
		border: var(--hairline-width) solid var(--grip-border);
		border-radius: 50%;
		background: var(--grip);
		appearance: none;
	}

	input::-moz-range-thumb {
		inline-size: var(--grip-size);
		block-size: var(--grip-size);
		border: var(--hairline-width) solid var(--grip-border);
		border-radius: 50%;
		background: var(--grip);
	}

	input:hover::-webkit-slider-thumb {
		border-width: var(--focus-width);
	}

	input:hover::-moz-range-thumb {
		border-width: var(--focus-width);
	}

	input:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.disabled {
		opacity: 0.45;
	}

	.disabled input {
		cursor: not-allowed;
	}
</style>
