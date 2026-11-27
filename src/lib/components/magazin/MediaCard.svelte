<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		meta,
		href,
		lang,
		media,
		children
	}: {
		id?: string;
		title: string;
		meta: string;
		href?: string;
		lang?: string;
		media: Snippet;
		children?: Snippet;
	} = $props();
</script>

<article {id} class:linked={href}>
	<div class="media" data-media="dock-top">{@render media()}</div>
	<div class="copy">
		<p class="meta">{meta}</p>
		<h3 {lang}>
			{#if href}<a {href}>{title}</a>{:else}{title}{/if}
		</h3>
		{@render children?.()}
	</div>
</article>

<style>
	article {
		position: relative;
		min-inline-size: 0;
		background: var(--card);
		scroll-margin-block-start: var(--bar);
		scroll-snap-align: start;
	}

	.media {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 9;
		background: var(--well);
	}

	.copy {
		display: grid;
		gap: var(--space-s);
		padding: var(--space-m);
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--type-meta);
		line-height: var(--line-meta);
	}

	h3 {
		margin: 0;
		font-size: var(--type-title);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-title);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a::after {
		position: absolute;
		inset: 0;
		content: '';
	}

	a:focus-visible {
		outline: none;
	}

	a:focus-visible::after {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.linked:active {
		background: var(--well);
	}

	@media (hover: hover) {
		.linked:hover h3 {
			text-decoration: underline;
			text-underline-offset: 0.16em;
		}
	}
</style>
