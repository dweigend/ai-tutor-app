<script lang="ts">
	import { RatingGroup } from 'bits-ui';
	import Icon from '../core/Icon.svelte';
	import { confidenceLevel, confidenceText, levelConfidence, type Confidence } from './scale.js';

	interface Props {
		/** 25 | 50 | 75 | 100, null for "ohne Angabe", undefined while nothing is chosen. */
		value?: Confidence;
		disabled?: boolean;
		label?: string;
	}

	let { value = $bindable(undefined), disabled = false, label = 'Wie sicher?' }: Props = $props();

	const labelId = $props.id();
	let level = $derived(confidenceLevel(value));
</script>

<div
	class="confidence"
	data-disabled={disabled || undefined}
	role="group"
	aria-labelledby={labelId}
>
	<p class="confidence-label" id={labelId}>{label}</p>
	<div class="confidence-controls">
		<RatingGroup.Root
			class="confidence-rating"
			min={0}
			max={4}
			value={level}
			onValueChange={(next) => (value = levelConfidence(next) ?? value)}
			{disabled}
			aria-labelledby={labelId}
			aria-valuetext={() => confidenceText(value)}
		>
			{#snippet children({ items })}
				{#each items as item (item.index)}
					<RatingGroup.Item index={item.index}>
						{#snippet child({ props })}
							<span
								{...props}
								class="confidence-segment"
								data-filled={item.index < level || undefined}
								data-selected={item.index + 1 === level || undefined}
							>
								{#if item.index + 1 === level}
									<span class="m-selection-sign"><Icon name="check" size={20} /></span>
								{/if}
							</span>
						{/snippet}
					</RatingGroup.Item>
				{/each}
			{/snippet}
		</RatingGroup.Root>

		<button
			type="button"
			class="m-hit confidence-none"
			aria-pressed={value === null}
			{disabled}
			onclick={() => (value = null)}
		>
			ohne Angabe
			{#if value === null}<Icon name="check" size={20} />{/if}
		</button>
	</div>
</div>
