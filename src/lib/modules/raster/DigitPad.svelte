<script lang="ts">
	import Value from '../readout/Value.svelte';
	import {
		keyExists,
		keyFromKeyboard,
		normalizeDigits,
		pressDigit,
		type DigitKey,
		type DigitOptions
	} from './digits.js';

	interface Props {
		/** The number as typed, with a decimal comma (`0,476`); goes to the check rules as is. */
		value?: string;
		decimals?: number;
		signed?: boolean;
		unit?: string;
		/** Accessible name of the field: the question it answers. */
		label: string;
		disabled?: boolean;
	}

	let {
		value = $bindable(''),
		decimals = 0,
		signed = false,
		unit,
		label,
		disabled = false
	}: Props = $props();

	const id = $props.id();
	/* Six digits keep the display readout on one line at 390px (DESIGN.md §6.3). */
	let options: DigitOptions = $derived({ decimals, signed, maxDigits: 6 });

	/* Phone order (reference R7): 1 2 3 on top, the comma, 0 and the back key below. */
	const DIGITS: readonly DigitKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

	function press(key: DigitKey) {
		if (disabled) return;
		value = pressDigit(value, key, options);
	}

	/* Hardware keys work directly; Enter and Tab keep their meaning (submit, move on). */
	function keydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const key = keyFromKeyboard(event.key);
		if (!key) {
			if (event.key.length === 1) event.preventDefault();
			return;
		}
		event.preventDefault();
		press(key);
	}

	function paste(event: ClipboardEvent) {
		event.preventDefault();
		if (disabled) return;
		value = normalizeDigits(event.clipboardData?.getData('text') ?? '', options);
	}

	let negative = $derived(value.startsWith('-'));
</script>

<!--
	DigitPad recipe (konzept M6, reference R7): one large, calm number in the middle and a frameless
	3 × 4 key field below it. The field is a real input with inputmode="none": the phone keyboard
	never opens and never shifts the stage. The sign is a round key beside the number, so the pad
	keeps its 3 × 4 shape: the readout row has the width of the key field, and ± sits flush over
	its first column as a key of the same kind. The back key shows a backspace sign, not an arrow.
-->
<div class="digit-pad" data-disabled={disabled || undefined}>
	<div class="pad-readout">
		{#if signed}
			<button
				type="button"
				class="pad-sign"
				aria-label="Vorzeichen"
				aria-pressed={negative}
				{disabled}
				onclick={() => press('±')}
			>
				±
			</button>
		{/if}
		<div class="pad-value">
			<label class="visually-hidden" for="{id}-input">{label}</label>
			<input
				id="{id}-input"
				class="pad-input"
				inputmode="none"
				autocomplete="off"
				spellcheck="false"
				aria-describedby="{id}-value"
				{value}
				readonly={disabled}
				onkeydown={keydown}
				onpaste={paste}
				oninput={(event) => (event.currentTarget.value = value)}
			/>
			<Value id="{id}-value" {value} {unit} size="display" placeholder="0" />
		</div>
	</div>
	<div class="pad-keys" role="group" aria-label="Ziffern">
		{#each DIGITS as key (key)}
			<button type="button" class="pad-key" {disabled} onclick={() => press(key)}>{key}</button>
		{/each}
		{#if keyExists(',', options)}
			<button
				type="button"
				class="pad-key"
				aria-label="Komma"
				{disabled}
				onclick={() => press(',')}
			>
				,
			</button>
		{:else}
			<span class="pad-key" aria-hidden="true"></span>
		{/if}
		<button type="button" class="pad-key" {disabled} onclick={() => press('0')}>0</button>
		<button
			type="button"
			class="pad-key"
			aria-label="Letzte Ziffer löschen"
			disabled={disabled || value === ''}
			onclick={() => press('back')}
		>
			<svg
				class="pad-backspace"
				viewBox="0 0 24 24"
				width="26"
				height="26"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M8.5 5H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8.5L2.5 12z" />
				<path d="M11.5 9l6 6M17.5 9l-6 6" />
			</svg>
		</button>
	</div>
</div>

<style>
	.digit-pad {
		display: grid;
		gap: var(--space-m);
		justify-items: center;
		inline-size: 100%;
	}

	/* Same width as the key field, so ± lines up with the first key column (R7). */
	.pad-readout {
		display: grid;
		grid-template-columns: var(--control) minmax(0, 1fr) var(--control);
		align-items: center;
		inline-size: min(100%, 20rem);
		min-block-size: calc(var(--row) + var(--space-m));
	}

	.pad-sign {
		grid-column: 1;
		display: grid;
		place-items: center;
		inline-size: var(--control);
		block-size: var(--control);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--well);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: var(--type-question);
		font-weight: var(--font-weight-regular);
		line-height: 1;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.pad-sign[aria-pressed='true'] {
		background: var(--action);
		color: var(--action-text);
	}

	.pad-sign:disabled {
		color: var(--text-muted);
		cursor: not-allowed;
	}

	.pad-backspace {
		fill: none;
		stroke: currentColor;
		stroke-width: var(--icon-stroke);
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.pad-value {
		position: relative;
		grid-column: 2;
		display: grid;
		place-items: center;
		min-inline-size: 0;
	}

	.pad-value :global(.readout-value) {
		font-family: var(--font-ui);
		font-weight: var(--font-weight-light);
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--letter-display);
	}

	.pad-value :global(.readout-unit) {
		font-size: var(--type-title);
		letter-spacing: 0;
		color: var(--text-muted);
	}

	/* The real input lies over the number: focus, typing and paste land here, it shows nothing. */
	.pad-input {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		border: 0;
		border-radius: var(--radius-option);
		background: transparent;
		color: transparent;
		caret-color: transparent;
		font: inherit;
		cursor: text;
	}

	.pad-input:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	.pad-keys {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-auto-rows: var(--control);
		gap: var(--step-1) var(--space-s);
		inline-size: min(100%, 20rem);
	}

	.pad-key {
		display: grid;
		place-items: center;
		min-block-size: var(--hit);
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text);
		font-family: var(--font-ui);
		font-size: var(--type-question);
		font-weight: var(--font-weight-regular);
		font-variant-numeric: tabular-nums;
		line-height: 1;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--tap-return) linear;
	}

	@media (hover: hover) {
		button.pad-key:hover:not(:disabled) {
			background: var(--well);
		}
	}

	/* Pressed: inverted at once, back within --tap-return (DESIGN.md §2.5). */
	button.pad-key:active:not(:disabled) {
		background: var(--action);
		color: var(--action-text);
		transition: none;
	}

	button.pad-key:disabled {
		color: var(--text-muted);
		cursor: not-allowed;
	}

	.pad-key:focus-visible,
	.pad-sign:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	@media (max-height: 46rem) {
		.pad-keys {
			grid-auto-rows: var(--hit);
			row-gap: 0;
		}
	}
</style>
