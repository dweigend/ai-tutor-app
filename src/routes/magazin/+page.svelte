<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { MotifId } from '$lib/art';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import { youtubeMagazineEntries, type YoutubeMagazineEntry } from '$lib/content/magazin';
	import YouTubeCard from '$lib/components/magazin/YouTubeCard.svelte';
	import MagazinShell from '$lib/components/magazin/MagazinShell.svelte';
	import MediaCard from '$lib/components/magazin/MediaCard.svelte';
	import MotifPicture from '$lib/components/magazin/MotifPicture.svelte';
	import {
		findEntry,
		magazinEntries,
		orderForDay,
		type MagazinEntry
	} from '$lib/components/magazin/article';
	import { episodeMinutes, essayFormLabel } from '$lib/components/magazin/labels';

	/*
	 * Today's lead (local calendar day). Prerendered HTML and hydration both show the first entry,
	 * so they agree; in the browser the day then decides. A tiny head script hides the page until
	 * that swap when today's lead is another one; without script it shows after two seconds.
	 */
	const entries = magazinEntries();
	let today = $state<Date | null>(null);
	$effect(() => {
		today = new Date();
		void tick().then(() => delete document.documentElement.dataset.routeStartup);
	});

	let order = $derived(
		today ? orderForDay(entries, today) : { lead: entries[0], rest: entries.slice(1) }
	);
	let lead = $derived(order.lead);
	let ordered = $derived([lead, ...order.rest]);
	let groups = $derived(
		lead.kind === 'episode' ? ['podcast', 'essays', 'videos'] : ['essays', 'podcast', 'videos']
	);
	const labels: Record<string, string> = {
		essays: 'Essays',
		podcast: 'Podcasts',
		videos: 'Videos'
	};
	const podcasts = youtubeMagazineEntries.filter((entry) => entry.category === 'podcast');
	const videos = youtubeMagazineEntries.filter((entry) => entry.category === 'video');

	function href(entry: MagazinEntry): string {
		return resolve('/magazin/[slug]', { slug: entry.item.id });
	}

	function meta(entry: MagazinEntry): string {
		return entry.kind === 'episode'
			? `Podcast · ${episodeMinutes(entry.item)} min`
			: `${essayFormLabel[entry.item.editorialStyle]} · ${entry.item.readingMinutes} min`;
	}

	const mediaMotifs: Record<string, MotifId> = {
		'gradient-descent-3b1b': 'home-lernraten',
		'backpropagation-intuition-3b1b': 'home-schaltwerk',
		'backpropagation-kettenregel-3b1b': 'home-whiteboard',
		'transformer-attention-3b1b': 'home-attention',
		'deepseek-mla-welch-labs': 'essay-transformer',
		'grokking-welch-labs': 'home-lernstand',
		'agententests-legora-latent-space': 'home-delegieren',
		'mechanistische-interpretierbarkeit-mlst': 'tutorial-schalttafel',
		'lernen-aus-erfahrung-deepmind': 'essay-lernstand',
		'effective-agents-ai-engineer': 'essay-tutor'
	};
	let activeVideo = $state<string>();

	function play(entry: YoutubeMagazineEntry) {
		activeVideo = entry.videoId;
		screenContext.setScreen({
			route: page.url.pathname,
			topic: entry.topicNote,
			media: { kind: 'youtube', id: entry.videoId, title: entry.title }
		});
	}

	/** A malformed fragment such as `#%` is ignored instead of throwing a URIError. */
	function decodedHash(raw: string): string {
		try {
			return decodeURIComponent(raw.slice(1));
		} catch {
			return '';
		}
	}

	/*
	 * Old links name an entry in the hash (`/magazin#die-gruene-lampe-luegt`, start tiles): they
	 * open that entry's own page. `#podcast` stays here and lands on the podcast row, also after
	 * the lead of the day has changed the height above it.
	 */
	$effect(() => {
		const hash = decodedHash(page.url.hash);
		if (!hash) return;
		if (findEntry(hash)) {
			void goto(resolve('/magazin/[slug]', { slug: hash }), { replaceState: true });
			return;
		}
		void lead;
		void tick().then(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }));
	});
</script>

<svelte:head>
	<meta name="tutor-magazin-startup" content={String(entries.length)} />
</svelte:head>

<MagazinShell title="Magazin">
	<!-- Rebuild the rails once on the daily swap so snap starts at the new first card. -->
	{#key lead.item.id}
		<div class="library">
			{#each groups as group (group)}
				<section aria-labelledby={group}>
					<h2 class="type-title" id={group} tabindex="-1">{labels[group]}</h2>
					<div class="media-grid" data-group={group}>
						{#if group !== 'videos'}
							{#each ordered.filter((entry) => entry.kind === (group === 'podcast' ? 'episode' : 'article')) as entry (entry.item.id)}
								<MediaCard title={entry.item.question} meta={meta(entry)} href={href(entry)}>
									{#snippet media()}
										<MotifPicture art={entry.item.art} priority={entry === lead} decorative />
									{/snippet}
									<p class="teaser">{entry.item.teaser}</p>
								</MediaCard>
							{/each}
						{/if}
						{#if group === 'podcast' || group === 'videos'}
							{#each group === 'podcast' ? podcasts : videos as entry, index (entry.id)}
								<YouTubeCard
									{entry}
									sectionId={group === 'podcast' && index === 0
										? 'podcasts-auf-youtube'
										: undefined}
									motif={mediaMotifs[entry.id] ?? 'magazin'}
									playing={activeVideo === entry.videoId}
									onplay={() => play(entry)}
								/>
							{/each}
						{/if}
					</div>
				</section>
			{/each}
		</div>
	{/key}
</MagazinShell>

<style>
	.library {
		max-inline-size: var(--content-width);
		margin-inline: auto;
		display: grid;
		gap: var(--space-l);
		padding-block: var(--space-m) var(--space-l);
	}

	section {
		min-inline-size: 0;
	}

	h2 {
		margin: 0 0 var(--space-m);
		padding-inline: var(--gutter);
		scroll-margin-block-start: var(--bar);
	}

	.media-grid {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 80%;
		align-items: start;
		gap: var(--space-m);
		overflow-x: auto;
		overscroll-behavior-inline: contain;
		scroll-snap-type: x mandatory;
		scrollbar-width: thin;
	}

	.teaser {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--type-meta);
		line-height: var(--line-meta);
	}

	@media (min-width: 40rem) {
		.media-grid {
			grid-auto-columns: calc((100% - var(--space-m)) / 2);
		}
	}

	@media (min-width: 54rem) {
		.library {
			padding-inline: var(--gutter);
		}

		h2 {
			padding-inline: 0;
		}

		.media-grid {
			grid-auto-flow: row;
			grid-template-columns: repeat(12, minmax(0, 1fr));
			align-items: stretch;
			overflow: visible;
		}

		.media-grid > :global(article) {
			grid-column: span 4;
		}

		.media-grid[data-group='podcast'] > :global(article:nth-child(n + 4)) {
			grid-column: span 6;
		}

		.media-grid[data-group='videos'] > :global(article:nth-child(n + 4)) {
			grid-column: span 3;
		}
	}
</style>
