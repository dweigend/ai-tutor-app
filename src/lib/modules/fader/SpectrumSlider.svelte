<script lang="ts">
	import Fader from './Fader.svelte';
	import { SPECTRUM_DETENTS, spectrumFlood, spectrumReading } from './scale.js';

	interface Props {
		/** Committed detent from −4 (NEIN, sicher) over 0 (UNSICHER) to 4 (JA, sicher). */
		value?: number;
		/** The statement the learner answers with yes or no. */
		label: string;
		/**
		 * False until the learner moves or sets the grip. Untouched, the middle is only the rest
		 * position; touched, it is a deliberate UNSICHER (scale.ts, spectrumCommittable).
		 */
		touched?: boolean;
		disabled?: boolean;
		onvaluecommit?: (value: number) => void;
	}

	let {
		value = $bindable(0),
		touched = $bindable(false),
		label,
		disabled = false,
		onvaluecommit
	}: Props = $props();

	function commit(detent: number) {
		touched = true;
		onvaluecommit?.(detent);
	}

	/* Share of the stage width kept free at each end, so the grip's target stays on screen. */
	const PADDING = 10;

	let position = $state(value);
	let reading = $derived(spectrumReading(position));
	let flood = $derived(spectrumFlood(position));
	/*
	 * Axis share → percent of the stage width. The middle mark sits at 50 %, every other edge on
	 * the grip; at a full end the flood also covers the padding behind the grip, so JA 100 % is
	 * exactly the right half.
	 */
	let edge = (axis: number) =>
		axis <= 0 ? 0 : axis >= 1 ? 100 : PADDING + axis * (100 - 2 * PADDING);
</script>

<!--
	SpectrumSlider recipe (art-direction-review §3.5, correction K2): the surface is the readout.
	Between the middle mark and the grip, --mark floods the whole stage height, so JA 100 % is the
	right half in yellow and UNSICHER has none (scale.ts, spectrumFlood). One display word in
	Archivo 300 stands in the middle of the chosen half and switches hard at the middle. Nine
	visible detents, no percentage at the grip, no red-green, no smileys. Never on a stage with
	ConfidenceStrip (DESIGN.md §11.6).
	The flood is positioned against the stage (the nearest positioned ancestor), behind its text.
-->
<div class="spectrum" data-side={reading.side} data-touched={touched || undefined}>
	{#if flood}
		<span
			class="spectrum-flood"
			aria-hidden="true"
			style:left="{edge(flood.from)}%"
			style:right="{100 - edge(flood.to)}%"
		></span>
	{/if}
	<p class="spectrum-word" aria-hidden="true">{reading.word}</p>
	<Fader
		min={-4}
		max={4}
		detents={SPECTRUM_DETENTS}
		bind:value
		bind:position
		{label}
		valuetext={(detent) => spectrumReading(detent).valuetext}
		padding={PADDING}
		{disabled}
		class="spectrum-fader"
		onvaluecommit={commit}
	>
		{#snippet children({ at: axisAt })}
			{#each SPECTRUM_DETENTS as detent (detent)}
				<span
					class="fader-tick"
					data-major={detent === 0 || Math.abs(detent) === 4 || undefined}
					style:left="{axisAt(detent)}%"
				></span>
			{/each}
		{/snippet}
	</Fader>
	<p class="spectrum-ends m-label" aria-hidden="true">
		<span>Nein</span><span>Ja</span>
	</p>
</div>
