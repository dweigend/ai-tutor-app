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
	import Opener from '$lib/components/magazin/Opener.svelte';
	import {
		findEntry,
		magazinEntries,
		orderForDay,
		type MagazinEntry
	} from '$lib/components/magazin/article';
	import { episodeMinutes, essayFormLabel } from '$lib/components/magazin/labels';
	import { Raster, type Slab } from '$lib/modules';

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

	function href(entry: MagazinEntry): string {
		return resolve('/magazin/[slug]', { slug: entry.item.id });
	}

	function meta(entry: MagazinEntry): string {
		return entry.kind === 'episode'
			? `Podcast · ${episodeMinutes(entry.item)} min`
			: `${essayFormLabel[entry.item.editorialStyle]} · ${entry.item.readingMinutes} min`;
	}

	/* Under the rubric PODCAST a row says only `19 min`; essays keep their form (art direction K6). */
	function rowMeta(entry: MagazinEntry): string {
		return entry.kind === 'episode' ? `${episodeMinutes(entry.item)} min` : meta(entry);
	}

	function slab(entry: MagazinEntry): Slab {
		return {
			id: entry.item.id,
			href: href(entry),
			title: entry.item.question,
			meta: rowMeta(entry)
		};
	}

	let articleSlabs = $derived(order.rest.filter((entry) => entry.kind === 'article').map(slab));
	let episodeSlabs = $derived(order.rest.filter((entry) => entry.kind === 'episode').map(slab));

	const mediaGroups = [
		{ id: 'videos', title: 'Videos auf YouTube', category: 'video' },
		{ id: 'podcasts-auf-youtube', title: 'Podcasts auf YouTube', category: 'podcast' }
	] as const;
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

<MagazinShell tone={lead.item.tone} title="Magazin | Tutor">
	<Opener
		tone={lead.item.tone}
		question={lead.item.question}
		art={lead.item.art}
		line={meta(lead)}
		href={href(lead)}
		icon={lead.kind === 'episode' ? 'play' : 'book'}
		action={lead.kind === 'episode' ? 'Hören' : 'Lesen'}
	>
		<p class="lead-teaser">{lead.item.teaser}</p>
	</Opener>

	<!-- Targets of the old hash links; the effect above opens the entry's own page. -->
	<div hidden>
		{#each entries as entry (entry.item.id)}<span id={entry.item.id}></span>{/each}
	</div>

	<div class="magazin-raster" data-surface="paper">
		{#if articleSlabs.length}
			<h2 class="m-label magazin-raster-title">Essays</h2>
			<Raster.SlabList items={articleSlabs} label="Essays" />
		{/if}
		{#if episodeSlabs.length}
			<h2 class="m-label magazin-raster-title" id="podcast" tabindex="-1">Eigene Podcasts</h2>
			<Raster.SlabList items={episodeSlabs} label="Eigene Podcasts" />
		{/if}
		{#each mediaGroups as group (group.id)}
			<section class="media-section" aria-labelledby={group.id}>
				<h2 class="media-title" id={group.id}>{group.title}</h2>
				<div class="media-grid">
					{#each youtubeMagazineEntries.filter((entry) => entry.category === group.category) as entry (entry.id)}
						<YouTubeCard
							{entry}
							motif={mediaMotifs[entry.id] ?? 'magazin'}
							playing={activeVideo === entry.videoId}
							onplay={() => play(entry)}
						/>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</MagazinShell>

<style>
	/* The teaser stands in full, never clamped (DESIGN.md §10.1). */
	.lead-teaser {
		margin: 0;
		padding-inline: var(--gutter);
		font-size: var(--type-body);
		line-height: var(--line-body);
	}

	.magazin-raster {
		padding-bottom: 96px;
	}

	/* Rubric and rows keep the opener's column, so one left edge runs down the page. */
	.magazin-raster-title,
	.magazin-raster :global(.raster) {
		max-inline-size: 40rem;
		margin-inline: auto;
	}

	.magazin-raster-title {
		display: flex;
		align-items: center;
		block-size: var(--bar);
		padding-inline: var(--gutter);
		scroll-margin-block-start: var(--bar);
	}

	.magazin-raster-title:focus {
		outline: none;
	}

	/* A row is at least 64px and grows with its title, which never touches the joint. */
	.magazin-raster :global(:is(.raster-item, .slab)) {
		block-size: auto;
		min-block-size: var(--row);
	}

	.magazin-raster :global(.slab) {
		padding-block: var(--space-s);
	}

	.media-section {
		max-inline-size: 72rem;
		margin-inline: auto;
		padding: var(--step-6) var(--gutter) 0;
	}

	.media-title {
		margin: 0 0 var(--step-4);
		font-size: var(--type-head);
		font-weight: var(--font-weight-strong);
		scroll-margin-block-start: calc(var(--bar) + var(--step-3));
	}

	.media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
		gap: var(--step-5);
	}
</style>
