<script lang="ts">
	import type { LearningEvidence } from '$lib/api/types';
	import {
		activityMirrorNotes,
		activityStatusCopy,
		helpLevelLabels,
		type ActivityConcept
	} from '$lib/content';
	import { Icon, ReadAloud, RichText, speakRichText } from '$lib/modules';
	import { evidenceKindLabel } from './labels';

	interface Props {
		concepts: readonly ActivityConcept[];
		liveEvidence: readonly LearningEvidence[];
		attemptDates: ReadonlyMap<string, string>;
	}

	let { concepts, liveEvidence, attemptDates }: Props = $props();

	const dateFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' });

	function attemptDate(concept: ActivityConcept): string | undefined {
		if (!('attemptId' in concept)) return undefined;
		const recordedAt = attemptDates.get(concept.attemptId);
		return recordedAt ? dateFormat.format(new Date(recordedAt)) : undefined;
	}

	function freshCopy(fresh: LearningEvidence): string {
		const date = dateFormat.format(new Date(fresh.recordedAt));
		return `Neuer Beleg vom ${date} · ${evidenceKindLabel[fresh.kind]} · ${helpLevelLabels[fresh.helpLevel]}. Die Einordnung folgt beim nächsten Abgleich.`;
	}
</script>

<section class="learning" data-section-id="concepts" aria-labelledby="concepts">
	<h2 id="concepts" class="type-label">Lernstand</h2>
	<ReadAloud.Segment as="p" class="activity-note">
		{activityMirrorNotes.thresholds}
	</ReadAloud.Segment>
	<ol class="activity-rows" role="list">
		{#each concepts as concept, index (concept.conceptId)}
			{@const status = activityStatusCopy[concept.status]}
			{@const fresh = liveEvidence.find((item) => item.learningGoalId === concept.learningGoalId)}
			{@const date = attemptDate(concept)}
			{@const criterion =
				'criterion' in concept ? speakRichText(concept.criterion) : status.explanation}
			{@const update = fresh ? freshCopy(fresh) : undefined}
			<ReadAloud.Segment
				as="li"
				say={[concept.label, status.label, date, criterion, update].filter(Boolean).join('. ')}
			>
				<details>
					<summary class="activity-row">
						<span class="activity-row-number type-meta" aria-hidden="true">
							{String(index + 1).padStart(2, '0')}
						</span>
						<span>
							<span class="activity-row-title type-title">{concept.label}</span>
							<span class="activity-row-meta type-meta">
								{status.label}{#if update}
									· Neuer Beleg{/if}
							</span>
						</span>
						<span class="activity-row-arrow" aria-hidden="true"><Icon name="arrow-right" /></span>
					</summary>
					<div class="activity-row-detail">
						{#if 'criterion' in concept}
							{#if date}<p class="type-meta">{date}</p>{/if}
							<p><RichText text={concept.criterion} /></p>
						{:else}
							<p>{status.explanation}</p>
						{/if}
						{#if update}<p>{update}</p>{/if}
					</div>
				</details>
			</ReadAloud.Segment>
		{/each}
	</ol>
</section>

<style>
	.learning {
		min-inline-size: 0;
		padding: var(--gutter);
	}
</style>
