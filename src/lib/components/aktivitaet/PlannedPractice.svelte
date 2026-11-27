<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActivityConcept, ActivityMirrorSeed } from '$lib/content';
	import { Icon, ReadAloud, SwipeRow } from '$lib/modules';

	interface Props {
		concepts: readonly ActivityConcept[];
		monthlyPoints: ActivityMirrorSeed['monthlyPoints'];
	}

	let { concepts, monthlyPoints }: Props = $props();

	const dateFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
	const href = resolve('/uebungen');

	/** Earliest planned date per concept, the one short reading of its row. */
	let plannedDates = $derived.by(() => {
		const dates = new Map<string, string>();
		const planned = monthlyPoints
			.flatMap((month) => month.points)
			.filter((point) => point.kind === 'planned')
			.sort((left, right) => left.date.localeCompare(right.date));
		for (const point of planned) {
			for (const conceptId of point.conceptIds) {
				if (!dates.has(conceptId)) dates.set(conceptId, point.date);
			}
		}
		return dates;
	});

	let offers = $derived(
		concepts
			.filter((concept) => concept.nextPractice)
			.map((concept) => {
				const date = plannedDates.get(concept.conceptId);
				return {
					id: concept.conceptId,
					title: concept.label,
					meta: date ? dateFormat.format(new Date(`${date}T12:00:00`)) : 'offen'
				};
			})
	);
</script>

<section class="offers" data-section-id="offers" aria-labelledby="offers">
	<ReadAloud.Segment
		say="Geplante Übungen. {offers.map((offer) => `${offer.title}, ${offer.meta}.`).join(' ')}"
	>
		<h2 id="offers" class="type-label">Geplant</h2>
	</ReadAloud.Segment>
	{#if offers.length}
		<ol class="activity-rows" role="list" aria-labelledby="offers">
			{#each offers as offer, index (offer.id)}
				<li>
					<SwipeRow flush name={offer.title}>
						<a class="activity-row" {href}>
							<span class="activity-row-number type-meta" aria-hidden="true">
								{String(index + 1).padStart(2, '0')}
							</span>
							<span>
								<span class="activity-row-title type-title">{offer.title}</span>
								<span class="activity-row-meta type-meta">{offer.meta}</span>
							</span>
							<span class="activity-row-arrow" aria-hidden="true"><Icon name="arrow-right" /></span>
						</a>
					</SwipeRow>
				</li>
			{/each}
		</ol>
	{:else}
		<p>Zurzeit ist keine Übung eingeplant.</p>
		<a class="m-hit" {href}>Zu den Übungen</a>
	{/if}
</section>

<style>
	.offers {
		padding: var(--gutter);
		border-block-start: var(--hairline-width) solid var(--hairline);
	}

	.activity-rows {
		--cell: calc(var(--row) - var(--hairline-width));
	}

	@media (min-width: 60rem) {
		.offers {
			border-block-start: 0;
		}
	}

	h2 {
		margin-block-end: var(--space-m);
	}

	a.m-hit {
		display: inline-flex;
		align-items: center;
	}
</style>
