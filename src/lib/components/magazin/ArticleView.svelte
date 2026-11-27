<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MotifImage } from '$lib/art';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import { exercises, type EditorialArticle } from '$lib/content';
	import { listTitle } from '$lib/components/uebungen/stage-model';
	import { Raster, ReadAloud, Readout, type Slab } from '$lib/modules';
	import ArticleFigure from './ArticleFigure.svelte';
	import InteractiveEssayFigure from './InteractiveEssayFigure.svelte';
	import EssayAudioBar from './EssayAudioBar.svelte';
	import Opener from './Opener.svelte';
	import SourceDrawer from './SourceDrawer.svelte';
	import {
		findEntry,
		inlineParts,
		numberSources,
		pad2,
		paragraphRefs,
		sectionBlocks,
		spokenText
	} from './article';
	import { episodeMinutes, essayFormLabel } from './labels';

	let { article }: { article: EditorialArticle } = $props();

	let sources = $derived(numberSources(article));
	let drawer = $state<SourceDrawer>();
	let form = $derived(essayFormLabel[article.editorialStyle]);

	let host = $state<HTMLElement>();
	let progress = $state<HTMLElement>();
	// The layout's section observer also records reading depth in the shared memory.
	let activeSection = $derived(
		screenContext.current.route === page.url.pathname ? screenContext.current.sectionId : undefined
	);

	$effect(() => {
		const articleNode = host;
		const indicator = progress;
		if (!articleNode || !indicator) return;
		const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
		let frame = 0;
		let resize: ResizeObserver | undefined;

		function update() {
			frame = 0;
			if (!articleNode || !indicator) return;
			const articleBounds = articleNode.getBoundingClientRect();
			const distance = articleBounds.height - window.innerHeight;
			const fraction = Math.max(0, Math.min(1, -articleBounds.top / Math.max(1, distance)));
			indicator.style.transform = `scaleX(${fraction})`;
		}

		function schedule() {
			if (frame === 0) frame = window.requestAnimationFrame(update);
		}

		function stop() {
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			resize?.disconnect();
			window.cancelAnimationFrame(frame);
			frame = 0;
		}

		function syncMotion() {
			stop();
			if (!motion.matches || !articleNode) return;
			window.addEventListener('scroll', schedule, { passive: true });
			window.addEventListener('resize', schedule);
			resize = new ResizeObserver(schedule);
			resize.observe(articleNode);
			schedule();
		}

		motion.addEventListener('change', syncMotion);
		syncMotion();
		return () => {
			motion.removeEventListener('change', syncMotion);
			stop();
		};
	});

	/* Exactly one calm recommendation: the next article or the matching exercise (konzept §4.4). */
	let next = $derived.by((): Slab | undefined => {
		const target = article.next;
		if (!target) return undefined;
		if (target.kind === 'uebung') {
			const exercise = exercises.find((item) => item.task.taskId === target.taskId);
			if (!exercise) return undefined;
			return {
				id: target.taskId,
				href: `${resolve('/uebungen')}?task=${encodeURIComponent(target.taskId)}`,
				title: listTitle(exercise),
				meta: `Übung · ${exercise.minutes} min`,
				state: 'next'
			};
		}
		const entry = findEntry(target.id);
		if (!entry) return undefined;
		return {
			id: entry.item.id,
			href: resolve('/magazin/[slug]', { slug: entry.item.id }),
			title: entry.item.question,
			meta:
				entry.kind === 'episode'
					? `Podcast · ${episodeMinutes(entry.item)} min`
					: `${essayFormLabel[entry.item.editorialStyle]} · ${entry.item.readingMinutes} min`,
			state: 'next'
		};
	});
</script>

<ReadAloud.Scope>
	<article class="article" bind:this={host}>
		<div class="reading-progress" data-surface="paper" aria-hidden="true">
			<span bind:this={progress}></span>
		</div>
		<Opener question={article.question} art={article.art} {form}>
			<ReadAloud.Segment as="p" class="article-deck">{article.deck}</ReadAloud.Segment>
			<EssayAudioBar readingMinutes={article.readingMinutes} />
		</Opener>

		<div class="article-body" data-surface="paper">
			<div class="article-column">
				{#each article.sections as section (section.id)}
					{@const title = section.lead ?? section.heading ?? 'Auftakt'}
					<section
						class="article-section"
						id={section.id}
						data-section-title={title}
						data-active={activeSection === section.id || undefined}
						aria-label={title}
					>
						{#if section.lead || section.heading}
							<h2 class="article-lead">{title}</h2>
						{/if}
						{#each sectionBlocks(section) as block, index (index)}
							{#if block.kind === 'paragraph'}
								{@const refs = paragraphRefs(block.paragraph, article, sources)}
								<ReadAloud.Segment class="article-paragraph" say={spokenText(block.paragraph.text)}>
									<p id={block.paragraph.id}>
										{#each inlineParts(block.paragraph.text) as part, p (p)}{#if part.kind === 'code'}<code
													data-code="inline"
												>
													{part.text}
												</code>{:else}{part.text}{/if}{/each}{#each refs as n (n)}<button
												type="button"
												class="article-ref"
												aria-label="Quelle {pad2(n)}: {sources[n - 1].source.label}"
												onclick={() => drawer?.reveal(n)}
											>
												[{pad2(n)}]
											</button>{/each}
									</p>
								</ReadAloud.Segment>
								{#if article.figure.after === block.paragraph.id}
									<InteractiveEssayFigure figure={article.figure} />
								{/if}
								{#each article.inlineImages.filter((image) => image.after === block.paragraph.id) as image (image.motif)}
									<figure class="article-image">
										<div class="article-image-motif" data-media="dock-top">
											<MotifImage motif={image.motif} sizes="(min-width: 40rem) 38rem, 100vw" />
										</div>
										<figcaption>{image.caption}</figcaption>
									</figure>
								{/each}
							{:else if block.kind === 'facts'}
								<aside class="article-facts" aria-labelledby="{section.id}-facts">
									<p class="visually-hidden" id="{section.id}-facts">Eckdaten</p>
									<Readout.Facts
										facts={{ kind: 'cells', cells: block.facts.cells }}
										label="Eckdaten"
									/>
								</aside>
							{:else}
								<ArticleFigure figure={block.figure} />
							{/if}
						{/each}
					</section>
				{/each}
			</div>

			<div class="article-column article-end">
				<SourceDrawer entries={sources} id="{article.id}-quelle" bind:this={drawer} />
			</div>

			{#if next}
				<nav class="article-next" aria-labelledby="{article.id}-weiter">
					<p class="m-label article-next-title" id="{article.id}-weiter">Weiter</p>
					<Raster.SlabList items={[next]} label="Weiter" />
				</nav>
			{/if}
		</div>
	</article>
</ReadAloud.Scope>

<style>
	/* The foot buffer belongs to the page, so an article without a way on keeps it too. */
	.article-body {
		padding-block: var(--space-l) calc(var(--duck-clearance) + var(--space-l));
	}

	/* One column of running text, 17px Archivo, on wide screens kept in the middle. */
	.article-column {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--step-6);
		max-inline-size: 40rem;
		margin-inline: auto;
		padding-inline: var(--gutter);
	}

	.article-section {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--step-4);
		scroll-margin-block-start: var(--bar);
	}

	:global(.article-deck) {
		margin: 0;
		font-size: var(--type-body);
		line-height: var(--line-body);
	}

	.reading-progress {
		position: sticky;
		inset-block-start: var(--bar);
		z-index: 9;
		block-size: var(--edge-width);
		margin-block-end: calc(-1 * var(--edge-width));
		pointer-events: none;
	}

	.reading-progress span {
		display: block;
		block-size: 100%;
		background: var(--mark);
		transform: scaleX(0);
		transform-origin: left center;
	}

	@media (prefers-reduced-motion: reduce) {
		.reading-progress {
			display: none;
		}
	}

	.article-lead {
		margin: 0;
		font-family: var(--font-ui);
		font-size: var(--type-lead);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-snug);
		text-wrap: balance;
	}

	:global(.article-paragraph) p[id] {
		scroll-margin-block-start: calc(var(--bar) + var(--step-3));
	}

	@media (prefers-reduced-motion: no-preference) {
		.article-lead {
			transition: transform 150ms ease-out;
		}

		.article-section[data-active] .article-lead {
			transform: translateX(var(--step-2));
		}
	}

	.article-image {
		display: grid;
		gap: var(--step-2);
		margin: 0;
	}

	.article-image-motif {
		aspect-ratio: 16 / 9;
	}

	.article-image figcaption {
		color: var(--text-muted);
		font-size: var(--type-label);
		line-height: var(--line-body);
	}

	:global(.article-paragraph[data-speaking='true']),
	:global(.article-deck[data-speaking='true']) {
		background: color-mix(in srgb, var(--mark) 21%, transparent);
	}

	:global(.article-paragraph) p {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--type-body);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-body);
		overflow-wrap: break-word;
	}

	/*
	 * [01] in the text: a quiet Mono index with a full 44px target. The negative block margin keeps
	 * the line box at text height, so the target reaches into the lines around it.
	 */
	.article-ref {
		display: inline-grid;
		place-items: center;
		min-inline-size: var(--hit);
		min-block-size: var(--hit);
		margin-block: calc((var(--hit) - 1lh) / -2);
		margin-inline-start: var(--step-1);
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--type-label);
		font-variant-numeric: tabular-nums;
		line-height: 1;
		vertical-align: middle;
		cursor: pointer;
		touch-action: manipulation;
	}

	.article-ref:active {
		background: var(--action);
		color: var(--action-text);
	}

	.article-ref:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.article-facts {
		display: grid;
		gap: var(--step-2);
		padding-block: var(--step-3);
		border-block: var(--hairline-width) solid var(--hairline);
	}

	.article-end {
		padding-block-end: var(--step-7);
	}

	.article-next-title {
		display: flex;
		align-items: center;
		block-size: var(--bar);
		margin: 0;
		padding-inline: var(--gutter);
	}

	/* The way on keeps the article's column. */
	.article-next {
		max-inline-size: 40rem;
		margin-inline: auto;
	}

	/* The plate is at least 64px and grows with its title, which never touches the edge. */
	.article-next :global(:is(.raster-item, .slab)) {
		block-size: auto;
		min-block-size: var(--row);
	}

	.article-next :global(.slab) {
		padding-block: var(--space-s);
	}
</style>
