<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';
	import ProgressDots from '../indicators/ProgressDots.svelte';
	let {
		accent = 'paper',
		title,
		backHref,
		onback,
		left,
		center,
		step,
		total
	}: {
		accent?:
			'exercise' | 'explanation' | 'magazine' | 'whiteboard' | 'activity' | 'today' | 'paper';
		title?: string;
		backHref?: string;
		onback?: (e: MouseEvent) => void;
		left?: Snippet;
		center?: Snippet;
		step?: number;
		total?: number;
	} = $props();
</script>

<header
	style:background={'var(--type-' + accent + ')'}
	style:color={'var(--type-' + accent + '-text)'}
>
	<div class="side">
		{#if left}{@render left()}{:else if backHref || onback}<IconButton
				icon="arrow-left"
				label="Zurück"
				href={backHref}
				onclick={onback}
			/>{/if}
	</div>
	<div class="center">
		{#if center}{@render center()}{:else if step !== undefined && total !== undefined}<ProgressDots
				{step}
				{total}
			/>{:else if title}<h1>{title}</h1>{/if}
	</div>
	<div class="reserve" aria-hidden="true"></div>
</header>

<style>
	header {
		width: 100%;
		margin: 0;
		display: grid;
		grid-template-columns: minmax(max-content, 1fr) minmax(0, auto) minmax(
				calc(var(--hit) + var(--shell-edge)),
				1fr
			);
		align-items: center;
		min-block-size: var(--bar);
		padding-inline: var(--shell-edge);
		padding-block-start: env(safe-area-inset-top);
	}
	.side,
	.center {
		min-inline-size: 0;
	}
	.center {
		display: grid;
		place-items: center;
		text-align: center;
	}
	h1 {
		margin: 0;
		font: var(--font-weight-regular) var(--type-title)/var(--line-title) var(--font-ui);
		min-width: 0;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
