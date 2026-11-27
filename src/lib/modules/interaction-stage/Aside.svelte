<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getStageContext } from './context.js';

	interface Props {
		/** False keeps the place reserved but empty, so nothing jumps when it appears. */
		active?: boolean;
		children: Snippet;
	}

	let { active = true, children }: Props = $props();

	const stage = getStageContext();
</script>

<div class="stage-aside" data-active={active} inert={!active || stage?.blocked}>
	{@render children()}
</div>
