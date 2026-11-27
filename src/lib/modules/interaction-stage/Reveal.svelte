<script lang="ts">
	import type { Snippet } from 'svelte';
	import { animate } from '../core/motion.js';
	import { getStageContext } from './context.js';
	import { Segment } from '../read-aloud/index.js';
	import Verdict from '../readout/Verdict.svelte';
	import type { Finding } from '../readout/types.js';

	interface Props {
		yours: string;
		/** Voice of my answer: a short value (Mono) or a sentence option (Archivo). */
		voice?: 'value' | 'sentence';
		confidence?: string;
		finding: Finding | null;
		expected?: string;
		/** Spoken version of the whole block. */
		say?: string;
		children?: Snippet;
	}

	let { yours, voice, confidence, finding, expected, say, children }: Props = $props();

	const id = $props.id();
	const stage = getStageContext();
	let open = $state(0);

	/*
	 * Instrument → reveal: a vertical wipe in place, the question stays (DESIGN.md §4.5). The
	 * edge runs down with `snap`; reduced motion shows the end state at once. Then the finding
	 * takes the focus and aria-live announces it.
	 */
	$effect(() => {
		const run = animate({
			from: 0,
			to: 1,
			preset: 'snap',
			restDelta: 0.002,
			onUpdate: (value) => (open = value)
		});
		document.getElementById(`${id}-verdict`)?.focus({ preventScroll: true });
		return () => run.stop();
	});
</script>

<div
	class="stage-reveal"
	data-budget="zone"
	data-zone="reveal"
	aria-live="polite"
	inert={stage?.blocked}
	style:clip-path="inset(0 0 {((1 - Math.min(open, 1)) * 100).toFixed(2)}% 0)"
>
	<Segment as="div" {say}>
		<Verdict id="{id}-verdict" {yours} {voice} {confidence} {finding} {expected}>
			{#if children}{@render children()}{/if}
		</Verdict>
	</Segment>
</div>
