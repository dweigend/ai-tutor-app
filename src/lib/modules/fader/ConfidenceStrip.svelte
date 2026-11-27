<script lang="ts">
	import { untrack } from 'svelte';
	import Fader from './Fader.svelte';
	import {
		CONFIDENCE_DETENTS,
		confidenceDetent,
		confidenceText,
		detentConfidence,
		type Confidence
	} from './scale.js';

	interface Props {
		/** 25 | 50 | 75 | 100, null for "ohne Angabe", undefined while nothing is chosen. */
		value?: Confidence;
		disabled?: boolean;
		/** Accessible name only; the strip itself shows no words (sketch R3). */
		label?: string;
	}

	let { value = $bindable(undefined), disabled = false, label = 'Wie sicher?' }: Props = $props();

	/* Share of the axis kept free at each end, so the grip never leaves the line. */
	const PADDING = 6;

	/* The value this strip set last; a different value comes from outside (a reset). */
	let own: Confidence = untrack(() => value);
	let detent = $state(untrack(() => confidenceDetent(value)));
	let position = $state(untrack(() => confidenceDetent(value)));

	$effect.pre(() => {
		const next = value;
		if (next === own) return;
		own = next;
		untrack(() => {
			detent = confidenceDetent(next);
			position = detent;
		});
	});

	/* − and + step one detent for a finger; the keyboard uses the arrows on the grip. */
	function step(by: number) {
		if (disabled) return;
		const next = Math.max(-2, Math.min(2, detent + by));
		detent = next;
		position = next;
		commit(next);
	}

	function commit(next: number) {
		const confidence = detentConfidence(next);
		own = confidence;
		value = confidence;
	}

	let side = $derived(position < -0.5 ? 'minus' : position > 0.5 ? 'plus' : 'middle');
</script>

<!--
	ConfidenceStrip recipe (V4-5, sketch R3): one calm − … + slider, no words on screen. The middle is
	marked and is the rest position; left is unsure (25, 50), right is sure (75, 100). The grip springs
	into five detents (Fader). Position, the thickened line between middle and grip and the filled
	grip carry the reading; screen readers hear it as aria-valuetext.
-->
<div
	class="confidence"
	data-disabled={disabled || undefined}
	data-touched={value !== undefined || undefined}
	data-side={side}
	role="group"
	aria-label={label}
>
	<div class="confidence-axis">
		<button
			type="button"
			class="confidence-end"
			tabindex="-1"
			aria-hidden="true"
			{disabled}
			onclick={() => step(-1)}
		>
			−
		</button>
		<Fader
			min={-2}
			max={2}
			detents={CONFIDENCE_DETENTS}
			bind:value={detent}
			bind:position
			{label}
			valuetext={(next) =>
				value === undefined && next === 0
					? 'nicht gewählt'
					: confidenceText(detentConfidence(next))}
			padding={PADDING}
			{disabled}
			class="confidence-fader"
			onvaluecommit={commit}
		>
			{#snippet children({ at })}
				{#if position !== 0}
					<span
						class="confidence-fill"
						style:left="{Math.min(at(0), at(position))}%"
						style:right="{100 - Math.max(at(0), at(position))}%"
					></span>
				{/if}
				{#each CONFIDENCE_DETENTS as mark (mark)}
					<span
						class="fader-tick"
						data-major={Math.abs(mark) === 2 || undefined}
						data-middle={mark === 0 || undefined}
						style:left="{at(mark)}%"
					></span>
				{/each}
			{/snippet}
		</Fader>
		<button
			type="button"
			class="confidence-end"
			tabindex="-1"
			aria-hidden="true"
			{disabled}
			onclick={() => step(1)}
		>
			+
		</button>
	</div>
</div>

<style>
	/* Centred in its row on every width: the duck no longer reaches into it. */
	.confidence {
		display: grid;
		justify-items: stretch;
		inline-size: 100%;
		max-inline-size: 24rem;
		margin-inline: auto;
	}

	.confidence-axis {
		display: grid;
		grid-template-columns: var(--hit) minmax(0, 1fr) var(--hit);
		align-items: center;
	}

	.confidence-end {
		display: grid;
		place-items: center;
		inline-size: var(--hit);
		block-size: var(--hit);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		font-family: var(--font-ui);
		font-size: var(--type-question);
		font-weight: var(--font-weight-light);
		line-height: 1;
		color: var(--text-muted);
		user-select: none;
	}

	.confidence-end:active:not(:disabled) {
		background: var(--well);
	}

	.confidence-end:disabled {
		cursor: not-allowed;
	}

	.confidence[data-side='minus'] .confidence-end:first-child,
	.confidence[data-side='plus'] .confidence-end:last-child {
		color: var(--text);
		font-weight: var(--font-weight-strong);
	}

	/* Line, ticks and the middle mark: the middle stands above and below the line (R3). */
	.confidence :global(.fader-tick[data-middle]) {
		block-size: 2.25rem;
		inline-size: var(--edge-width);
		translate: -50% -50%;
		background: var(--text);
	}

	.confidence-fill {
		position: absolute;
		inset-block-start: 50%;
		block-size: 3px;
		translate: 0 -50%;
		border-radius: var(--radius-pill);
		background: var(--grip);
	}

	/* Untouched, the grip only rests in the middle: an empty ring, no fill. */
	.confidence:not([data-touched]) :global(.fader-grip) {
		background: var(--surface);
		border: var(--edge-width) solid var(--text);
	}

	.confidence[data-disabled] {
		opacity: 0.6;
	}
</style>
