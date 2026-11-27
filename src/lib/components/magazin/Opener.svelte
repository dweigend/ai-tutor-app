<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ArtImage } from '$lib/content';
	import MotifPicture from './MotifPicture.svelte';

	let {
		question,
		art,
		form,
		children
	}: {
		question: string;
		art: ArtImage;
		form: string;
		children: Snippet;
	} = $props();
</script>

<header class="opener">
	<div class="intro">
		<p class="type-meta">{form}</p>
		<h2>{question}</h2>
		{@render children()}
	</div>
	<div class="art" data-media="bleed">
		<MotifPicture {art} priority sizes="(min-width: 56rem) 36rem, 86vw" />
	</div>
</header>

<style>
	.opener {
		display: grid;
		margin-inline: var(--gutter);
		background: var(--card);
	}

	.intro {
		display: grid;
		align-content: center;
		gap: var(--space-m);
		min-inline-size: 0;
		padding: var(--space-m);
	}

	h2,
	p {
		margin: 0;
	}

	p {
		color: var(--text-muted);
	}

	h2 {
		font-size: var(--type-head);
		font-weight: var(--font-weight-light);
		line-height: var(--line-head);
		text-wrap: balance;
	}

	.art {
		position: relative;
		aspect-ratio: 16 / 9;
	}

	@media (min-width: 56rem) {
		.opener {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.intro {
			padding: var(--space-l);
		}

		.art {
			grid-column: 2;
			aspect-ratio: 4 / 3;
		}
	}
</style>
