<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { MotifImage, type MotifId } from '$lib/art';
	import type { YoutubeMagazineEntry } from '$lib/content/magazin';
	import { Icon } from '$lib/modules';
	import MediaCard from './MediaCard.svelte';
	import { youtubeEmbed, youtubeWatch } from './youtube';

	let {
		entry,
		motif,
		sectionId,
		playing,
		onplay
	}: {
		entry: YoutubeMagazineEntry;
		motif: MotifId;
		sectionId?: string;
		playing: boolean;
		onplay: () => void;
	} = $props();

	let embed = $derived(youtubeEmbed(entry.videoId, playing));
	let player = $state<HTMLIFrameElement>();
	let relatedHref = $derived.by(() => {
		const route = entry.relatedRoute;
		switch (route) {
			case '/uebungen':
			case '/erklaerungen':
			case '/tutor':
				return resolve(route);
			case undefined:
				return undefined;
			default:
				return resolve('/magazin/[slug]', { slug: route.slice('/magazin/'.length) });
		}
	});
	let relatedLabel = $derived.by(() => {
		switch (entry.relatedRoute) {
			case '/uebungen':
				return 'Zu den Übungen';
			case '/erklaerungen':
				return 'Zu den Erklärungen';
			case '/tutor':
				return 'Zum Tutor';
			default:
				return 'Zum Essay';
		}
	});

	async function play() {
		onplay();
		await tick();
		player?.focus();
	}
</script>

<MediaCard id="video-{entry.videoId}" title={entry.title} meta="{entry.channel} · {entry.duration}">
	{#snippet media()}
		{#if sectionId}<span id={sectionId} class="anchor"></span>{/if}
		{#if embed}
			<iframe
				bind:this={player}
				src={embed}
				title={entry.title}
				referrerpolicy="strict-origin-when-cross-origin"
				allow="autoplay; encrypted-media; picture-in-picture"
				allowfullscreen
			></iframe>
		{:else}
			<div class="poster" data-media="bleed">
				<MotifImage
					{motif}
					alt=""
					sizes="(min-width: 54rem) 22rem, (min-width: 40rem) 50vw, 100vw"
				/>
			</div>
			<button
				class="m-icon-button play"
				data-size="lg"
				type="button"
				aria-label="{entry.category === 'video'
					? 'Video'
					: 'Podcast'} auf YouTube abspielen: {entry.title}"
				onclick={play}
			>
				<Icon name="play" />
			</button>
		{/if}
	{/snippet}
	{#if embed}
		<p>{entry.topicNote}</p>
		{#if entry.thinkPrompt}<p>{entry.thinkPrompt}</p>{/if}
		<div class="links">
			<a href={youtubeWatch(entry.videoId)} target="_blank" rel="noopener noreferrer">
				<Icon name="external" size={20} /> Auf YouTube öffnen
			</a>
			{#if relatedHref}<a href={relatedHref}>{relatedLabel}</a>{/if}
		</div>
	{/if}
</MediaCard>

<style>
	.anchor {
		position: absolute;
		inset-block-start: 0;
		scroll-margin-block-start: var(--bar);
	}

	.play {
		position: absolute;
		inset: 0;
		margin: auto;
	}

	.play:active {
		background: var(--action);
		color: var(--action-text);
	}

	.play:focus-visible {
		outline: var(--focus-width) solid var(--palette-paper);
		outline-offset: var(--focus-width);
	}

	.poster,
	iframe {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
	}

	.poster {
		filter: grayscale(1);
	}

	iframe {
		border: 0;
	}

	iframe:focus-visible {
		outline-offset: calc(-1 * var(--focus-width));
	}

	p {
		margin: 0;
		font-size: var(--type-meta);
		line-height: var(--line-meta);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-s) var(--space-m);
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-s);
		min-block-size: var(--hit);
		color: inherit;
		font-size: var(--type-meta);
		text-underline-offset: 0.2em;
	}
</style>
