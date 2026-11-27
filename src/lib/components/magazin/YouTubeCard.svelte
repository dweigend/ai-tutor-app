<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { MotifImage, type MotifId } from '$lib/art';
	import type { YoutubeMagazineEntry } from '$lib/content/magazin';
	import { Icon } from '$lib/modules';
	import { youtubeEmbed, youtubeWatch } from './youtube';

	let {
		entry,
		motif,
		playing,
		onplay
	}: {
		entry: YoutubeMagazineEntry;
		motif: MotifId;
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

<article class="youtube-card" id="video-{entry.videoId}">
	<div class="youtube-frame" data-surface="ink">
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
			<div class="youtube-poster">
				<MotifImage
					{motif}
					alt=""
					sizes="(min-width: 70rem) 22rem, (min-width: 48rem) 46vw, 100vw"
				/>
			</div>
			<button
				class="youtube-play"
				type="button"
				aria-label="{entry.category === 'video'
					? 'Video'
					: 'Podcast'} auf YouTube abspielen: {entry.title}"
				onclick={play}
			>
				<Icon name="play" />
			</button>
		{/if}
	</div>
	<div class="youtube-copy">
		<p class="youtube-meta">
			<span class="channel">{entry.channel}</span>
			<span>{entry.duration}</span>
		</p>
		<h3 lang="en">{entry.title}</h3>
		<p>{entry.topicNote}</p>
		{#if entry.thinkPrompt}
			<p class="think-prompt">{entry.thinkPrompt}</p>
		{/if}
		{#if embed || relatedHref}
			<div class="youtube-links">
				{#if embed}
					<a href={youtubeWatch(entry.videoId)} target="_blank" rel="noopener noreferrer">
						<Icon name="external" size={20} /> Auf YouTube öffnen
					</a>
				{/if}
				{#if relatedHref}
					<a href={relatedHref}>{relatedLabel}</a>
				{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.youtube-card {
		min-inline-size: 0;
		border-block-end: var(--hairline-width) solid var(--hairline);
		scroll-margin-block-start: calc(var(--bar) + var(--step-3));
	}

	.youtube-frame {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 9;
		background: var(--surface);
	}

	.youtube-play {
		position: absolute;
		display: grid;
		place-items: center;
		inline-size: var(--control);
		block-size: var(--control);
		border: var(--hairline-width) solid var(--mark-border);
		border-radius: 50%;
		background: var(--mark);
		color: var(--mark-text);
		cursor: pointer;
	}

	.youtube-play:focus-visible,
	iframe:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	.youtube-poster,
	iframe {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
	}

	iframe {
		border: 0;
	}

	.youtube-copy {
		display: grid;
		gap: var(--step-2);
		padding-block: var(--step-3) var(--step-4);
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		font-size: var(--type-lead);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-snug);
		overflow-wrap: anywhere;
	}

	.youtube-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--step-2);
		color: var(--text-muted);
		font-size: var(--type-label);
		font-variant-numeric: tabular-nums;
	}

	.channel {
		padding: var(--step-1) var(--step-2);
		border-radius: var(--radius-pill);
		background: var(--well);
		color: var(--text);
	}

	.think-prompt {
		padding-inline-start: var(--step-2);
		border-inline-start: var(--edge-width) solid var(--grip);
	}

	.youtube-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--step-2) var(--step-3);
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: var(--step-1);
		min-block-size: var(--hit);
		color: var(--text);
		text-underline-offset: 0.2em;
	}
</style>
