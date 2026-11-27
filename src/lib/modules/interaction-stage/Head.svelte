<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Segment } from '../read-aloud/index.js';
	import { getStageContext } from './context.js';

	interface Props {
		/** Spoken version of context, facts and question together (textredaktion `spoken`). */
		say?: string;
		children: Snippet;
	}

	let { say, children }: Props = $props();
	const stage = getStageContext();
</script>

<!-- Context, question and facts as one ReadAloud segment: one breath, one highlight. -->
<Segment as="section" class="stage-head" {say} inert={stage?.leaving}>
	{@render children()}
</Segment>
