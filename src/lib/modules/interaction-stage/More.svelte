<script lang="ts">
	import type { Snippet } from 'svelte';
	import Fold from '../fold/Fold.svelte';
	import { getStageContext } from './context.js';

	interface Props {
		label?: string;
		children: Snippet;
	}

	let { label = 'Mehr', children }: Props = $props();

	/* The stage owns the open state: Escape, a new step and the reveal close it (Root). */
	const stage = getStageContext();
	let local = $state(false);
	const getOpen = () => stage?.moreOpen ?? local;
	const setOpen = (open: boolean) => {
		if (stage) stage.moreOpen = open;
		else local = open;
	};
</script>

<!--
	"Mehr" as a Fold row under the head. Open, it lies over instrument and aside on the stage's own
	surface, so nothing below moves and nothing scrolls (konzept §1.5, Z3: sources live here).
	While it is open, the zones below are inert: no Tab, no tap reaches them.
-->
<Fold
	{label}
	bind:open={getOpen, setOpen}
	flat
	inert={stage?.leaving}
	class="stage-more"
	contentClass="stage-more-content"
	triggerLabel="{label} öffnen"
>
	{@render children()}
</Fold>
