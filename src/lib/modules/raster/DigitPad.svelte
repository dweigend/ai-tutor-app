<script lang="ts">
	import Value from '../readout/Value.svelte';
	import Cell from './Cell.svelte';
	import {
		PAD_KEYS,
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

	const KEY_NAME: Partial<Record<DigitKey, string>> = { '±': 'Vorzeichen', ',': 'Komma' };
</script>

<!--
	DigitPad recipe (konzept M6) = Readout (value) + Raster (keys). The field is a real input with
	inputmode="none": the phone keyboard never opens and never shifts the stage.
-->
<div class="digit-pad" data-disabled={disabled || undefined}>
	<div class="digit-pad-readout">
		<label class="visually-hidden" for="{id}-input">{label}</label>
		<input
			id="{id}-input"
			class="digit-pad-input"
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
		<button
			type="button"
			class="m-hit m-label digit-pad-back"
			aria-label="Letzte Ziffer löschen"
			disabled={disabled || value === ''}
			onclick={() => press('back')}
		>
			Löschen
		</button>
	</div>
	<div class="raster" data-layout="keys" data-kind="key" role="group" aria-label="Ziffern">
		{#each PAD_KEYS as key (key)}
			{#if keyExists(key, options)}
				<button
					type="button"
					class="raster-cell"
					aria-label={KEY_NAME[key]}
					{disabled}
					onclick={() => press(key)}
				>
					<Cell>{key}</Cell>
				</button>
			{:else}
				<span class="raster-cell" aria-hidden="true"></span>
			{/if}
		{/each}
	</div>
</div>
