<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getStageContext } from './context.js';

	interface Props {
		/** submit commits the answer (Festlegen); button moves on (Weiter). */
		type?: 'submit' | 'button';
		/** For a submit key: defaults to "only when ready". */
		disabled?: boolean;
		onclick?: () => void;
		children: Snippet;
	}

	let { type = 'submit', disabled, onclick, children }: Props = $props();

	const stage = getStageContext();
	let off = $derived(disabled ?? (type === 'submit' && stage?.state !== 'ready'));
</script>

<!-- The action sits in the center of its own zone (DESIGN.md §2.6). -->
<button
	{type}
	class="stage-action m-hit m-key"
	data-primary-action
	data-row
	disabled={off}
	inert={stage?.blocked}
	onclick={type === 'button' ? onclick : undefined}
>
	{@render children()}
</button>
