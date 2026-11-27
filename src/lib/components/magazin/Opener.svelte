<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ArtImage, MagazinTone } from '$lib/content';
	import { Icon, type IconName } from '$lib/modules';
	import MotifPicture from './MotifPicture.svelte';
	import { unitParts } from './article';

	interface Props {
		tone: MagazinTone;
		/** The lead question for the article or overview. */
		question: string;
		art: ArtImage;
		/** The Bildzeile: form and minutes, true values only (§6.6). */
		line: string;
		/** h1 on the article page, h2 in the overview (the bar mark is the h1 there). */
		level?: 1 | 2;
		/** The way in: one ink pill on the gutter, with the sign of what it starts. */
		href?: string;
		action?: string;
		icon?: IconName;
		/** The index teaser or the article deck under the Bildzeile. */
		children?: Snippet;
		beforeArt?: Snippet;
	}

	let {
		tone,
		question,
		art,
		line,
		level = 2,
		href,
		action,
		icon,
		children,
		beforeArt
	}: Props = $props();
</script>

<header class="opener" data-surface={tone}>
	<svelte:element this={`h${level}`} class="opener-question">{question}</svelte:element>
	{#if beforeArt}
		<p class="opener-line">{line}</p>
		{@render beforeArt()}
	{/if}
	<div class="opener-motif">
		<MotifPicture {art} priority />
	</div>
	{#if !beforeArt}
		<p class="opener-line">
			{#each unitParts(line) as part, index (index)}{#if part.unit}<span class="m-unit">
						{part.text}
					</span>{:else}{part.text}{/if}{/each}
		</p>
	{/if}
	{@render children?.()}
	{#if href && action}
		<a class="m-key m-keyword opener-enter" {href} data-primary-action data-row>
			{#if icon}<Icon name={icon} />{/if}
			{action}
		</a>
	{/if}
</header>

<style>
	/* Full-width surface; on wide screens the content keeps one column in the middle. */
	.opener {
		display: grid;
		gap: var(--step-3);
		padding-block: var(--step-3) var(--step-5);
		padding-inline: max(0px, (100% - 40rem) / 2);
	}

	.opener:has(.opener-enter) {
		padding-block-end: 0;
	}

	.opener-question {
		margin: 0;
		padding-inline: var(--gutter);
		font-family: var(--font-ui);
		font-size: var(--type-head);
		font-weight: var(--font-weight-light);
		line-height: var(--line-head);
		text-wrap: balance;
	}

	/* The motif runs edge to edge, cut off by a 1px joint above and below (art direction K1). */
	.opener-motif {
		border-block: var(--hairline-width) solid var(--hairline);
	}

	.opener-line {
		margin: 0;
		padding-inline: var(--gutter);
		font-family: var(--font-ui);
		font-size: var(--type-label);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-body);
		letter-spacing: var(--letter-label);
		text-transform: uppercase;
	}

	/* The pill stands in the middle of the opener's lowest 80px, on the gutter (§2.6, §2.10). */
	.opener-enter {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		gap: var(--space-s);
		min-block-size: var(--control);
		margin: calc((var(--action-zone) - var(--control)) / 2) var(--gutter);
		padding-inline: var(--space-m) var(--space-l);
		border-radius: var(--radius-pill);
		text-decoration: none;
		touch-action: manipulation;
	}

	.opener-enter:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}
</style>
