<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getStageContext } from './context.js';

	interface Props {
		/** Name for assistive technology, e.g. "Antwort". */
		label?: string;
		/** Full width: the instrument draws to the screen edges (SpectrumSlider). */
		bleed?: boolean;
		children: Snippet;
	}

	let { label, bleed = false, children }: Props = $props();

	const stage = getStageContext();
</script>

<!-- Exactly one instrument per screen (DESIGN.md §1.1); it carries the only frame. -->
<div
	class="stage-instrument"
	data-instrument
	data-bleed={bleed || undefined}
	data-budget="zone"
	data-zone="instrument"
	role="group"
	aria-label={label}
	inert={stage?.blocked}
>
	{@render children()}
</div>
