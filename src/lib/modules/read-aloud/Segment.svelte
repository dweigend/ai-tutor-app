<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DEFAULT_LANG } from './controller.js';
	import { getReadAloudContext, getScopeContext } from './context.js';

	interface Props {
		/** Spoken version, e.g. for a formula. Defaults to the visible text. */
		say?: string;
		/** Element to render; a block by default. */
		as?: 'div' | 'p' | 'li' | 'section';
		class?: string;
		inert?: boolean;
		children: Snippet;
	}

	let { say, as = 'div', class: className, inert, children }: Props = $props();

	const id = $props.id();
	const readAloud = getReadAloudContext();
	const scope = getScopeContext();
	let element = $state<HTMLElement>();

	$effect(() => {
		if (!readAloud || !element) return;
		const node = element;
		return readAloud.controller.register({
			id,
			scope: scope?.id ?? null,
			lang: scope?.lang ?? DEFAULT_LANG,
			// Read at start: the visible text (the controller tidies its whitespace).
			text: () => say ?? node.textContent ?? '',
			node
		});
	});

	let speaking = $derived(readAloud?.state.activeId === id);
</script>

<svelte:element
	this={as}
	bind:this={element}
	class={['ra-segment', className]}
	data-speaking={speaking}
	{inert}
>
	{@render children()}
</svelte:element>

<style>
	.ra-segment {
		position: relative;
	}

	/* The spoken segment: a 2px rule in the margin column, in the grip colour. A hard switch. */
	.ra-segment[data-speaking='true']::before {
		position: absolute;
		inset-block: 0;
		inset-inline-start: calc(-1 * var(--step-2));
		inline-size: var(--edge-width);
		background: var(--grip);
		content: '';
	}
</style>
