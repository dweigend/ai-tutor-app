<script lang="ts">
	import { Progress } from 'bits-ui';

	interface Props {
		/** 1-based number of the current step. */
		step: number;
		steps: number;
		/** Steps already done; they read as filled (--text), the current one as --mark. */
		done?: number;
		label?: string;
	}

	let { step, steps, done = step - 1, label = 'Fortschritt' }: Props = $props();

	let segments = $derived(Array.from({ length: Math.max(steps, 1) }, (_, index) => index));
</script>

<!-- One dot per step, plus an explicit reading. -->
<Progress.Root
	class="readout-meter"
	value={done}
	max={Math.max(steps, 1)}
	aria-label={label}
	aria-valuetext="Schritt {step} von {steps}"
>
	{#each segments as index (index)}
		<span
			aria-hidden="true"
			class="readout-meter-segment"
			data-state={index === step - 1 ? 'current' : index < done ? 'done' : 'open'}
		></span>
	{/each}
	<span aria-hidden="true">{step}/{steps}</span>
</Progress.Root>
