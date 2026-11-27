<script lang="ts">
	import { RadioGroup, ToggleGroup } from 'bits-ui';
	import RichText from '../core/RichText.svelte';
	import Cell from './Cell.svelte';

	interface Option {
		id: string;
		label: string;
	}

	interface Props {
		options: readonly Option[];
		/** single: one answer (RadioGroup); multiple: several (ToggleGroup). */
		type?: 'single' | 'multiple';
		/** Legacy layout hint, retained for the default option voice. */
		layout?: 'grid' | 'flip' | 'rows';
		/**
		 * Voice of the options: `value` uses tabular figures, `sentence` uses running text. Defaults to `sentence` for rows, `value` otherwise.
		 */
		voice?: 'value' | 'sentence';
		value?: string[];
		/** While the answer is on its way; afterwards the reveal replaces the instrument. */
		disabled?: boolean;
		label: string;
	}

	let {
		options,
		type = 'single',
		layout = 'grid',
		voice,
		value = $bindable([]),
		disabled = false,
		label
	}: Props = $props();

	/*
	 * Options carry digits, never letters: programs A and B in the content must not collide with
	 * an option B (art-director correction K1).
	 */
	const LEGENDS = '12345678';

	let optionVoice = $derived(voice ?? (layout === 'rows' ? 'sentence' : 'value'));

	/* 1–4 choose directly while the focus is inside (konzept M4). */
	function digitKey(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || disabled) return;
		const index = LEGENDS.indexOf(event.key);
		const option = options[index];
		if (event.key.length !== 1 || index < 0 || !option) return;
		event.preventDefault();
		if (type === 'single') value = [option.id];
		else
			value = value.includes(option.id)
				? value.filter((id) => id !== option.id)
				: [...value, option.id];
	}
</script>

<!-- Recipe on the Raster (DESIGN.md §11 P3): one skin, one cell, Bits UI only as the root. -->
{#if type === 'single'}
	<RadioGroup.Root
		orientation="vertical"
		class="raster choice-grid"
		data-layout={layout}
		data-voice={optionVoice}
		data-kind="single"
		aria-label={label}
		value={value[0] ?? ''}
		onValueChange={(next) => (value = next ? [next] : [])}
		{disabled}
		onkeydown={digitKey}
	>
		{#each options as option, index (option.id)}
			<RadioGroup.Item value={option.id}>
				{#snippet child({ props, checked })}
					<button {...props} class="raster-cell" data-selected={checked || undefined}>
						<Cell legend={LEGENDS[index]} selected={checked}>
							<RichText text={option.label} />
						</Cell>
					</button>
				{/snippet}
			</RadioGroup.Item>
		{/each}
	</RadioGroup.Root>
{:else}
	<ToggleGroup.Root
		orientation="vertical"
		type="multiple"
		class="raster choice-grid"
		data-layout={layout}
		data-voice={optionVoice}
		data-kind="multiple"
		aria-label={label}
		{value}
		onValueChange={(next) => (value = next)}
		{disabled}
		onkeydown={digitKey}
	>
		{#each options as option, index (option.id)}
			<ToggleGroup.Item value={option.id}>
				{#snippet child({ props, pressed })}
					<button {...props} class="raster-cell" data-selected={pressed || undefined}>
						<Cell legend={LEGENDS[index]} selected={pressed}>
							<RichText text={option.label} />
						</Cell>
					</button>
				{/snippet}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
{/if}
