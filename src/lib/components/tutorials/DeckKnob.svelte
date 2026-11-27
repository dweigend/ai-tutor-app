<script lang="ts">
	/*
	 * The one control of a slide in the bottom bar: a readout and a slider on one line. Steps of
	 * a choice (token, node) and continuous values (temperature, learning rate) share it. The
	 * readout is a white pill like the round keys beside it, the track a round groove.
	 */
	let {
		label,
		readout,
		min,
		max,
		step,
		value,
		oninput,
		onrelease
	}: {
		/** Accessible name of the slider. */
		label: string;
		/** The value as it reads, e.g. `lr 0,25`. */
		readout: string;
		min: number;
		max: number;
		step: number;
		value: number;
		oninput: (value: number) => void;
		/** The grip was let go; the readout is handed over for feedback. */
		onrelease?: (readout: HTMLElement) => void;
	} = $props();

	const id = $props.id();
	let output = $state<HTMLOutputElement>();
</script>

<div class="knob">
	<output class="readout" for={id} bind:this={output}>{readout}</output>
	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		{value}
		aria-label={label}
		aria-valuetext={readout}
		oninput={(event) => oninput(event.currentTarget.valueAsNumber)}
		onchange={() => output && onrelease?.(output)}
	/>
</div>

<style>
	.knob {
		display: flex;
		align-items: center;
		gap: var(--space-s);
		min-inline-size: 0;
	}

	/* A short value (`a`, `T1`) makes a circle of 44px, a longer one (`lr 0,05`) a pill. */
	.readout {
		display: grid;
		flex: none;
		place-items: center;
		min-inline-size: var(--hit);
		block-size: var(--hit);
		padding-inline: var(--space-m);
		border-radius: var(--radius-pill);
		background: var(--palette-white);
		color: var(--palette-ink);
		font-variant-numeric: tabular-nums;
		line-height: 1;
		white-space: nowrap;
	}

	input {
		flex: 1;
		min-inline-size: 0;
		block-size: var(--hit);
		margin: 0;
		background: transparent;
		cursor: pointer;
		appearance: none;
		touch-action: pan-y;
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
		box-sizing: border-box;
		inline-size: var(--grip-size);
		block-size: var(--grip-size);
		border: var(--hairline-width) solid var(--grip-border);
		border-radius: 50%;
		background: var(--grip);
	}

	input:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}
</style>
