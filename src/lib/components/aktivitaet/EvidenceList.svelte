<script lang="ts">
	import { helpLevelLabels } from '$lib/content';
	import { Icon, ReadAloud, RichText, speakRichText } from '$lib/modules';
	import type { EvidenceRow } from './mirror';
	import { evidenceKindLabel } from './labels';

	let { rows }: { rows: readonly EvidenceRow[] } = $props();

	const OUTCOME_LABEL = {
		korrekt: 'gelungen',
		teilweise: 'teilweise',
		falsch: 'nicht gelungen',
		nicht_beurteilbar: 'nicht beurteilbar'
	} as const;

	const dateFormat = new Intl.DateTimeFormat('de-DE', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});

	function facts(row: EvidenceRow): string[] {
		const parts: string[] = [];
		if (row.outcome) parts.push(OUTCOME_LABEL[row.outcome]);
		parts.push(
			row.helpLevel === undefined ? 'Hilfe nicht erfasst' : helpLevelLabels[row.helpLevel]
		);
		if (row.confidenceBefore !== undefined) parts.push(`Vorab sicher ${row.confidenceBefore} %`);
		if (row.evidenceKind) parts.push(evidenceKindLabel[row.evidenceKind]);
		if (row.transferDistance === 'far') parts.push('neuer Kontext');
		if (row.elapsedSinceLearningDays !== undefined) {
			parts.push(`${row.elapsedSinceLearningDays} Tage nach dem Lernen`);
		}
		return parts;
	}
</script>

{#if rows.length}
	<ol class="activity-rows" role="list">
		{#each rows as row, index (row.key)}
			{@const date = dateFormat.format(new Date(row.recordedAt))}
			{@const title = row.origin === 'live' ? `Neu. ${row.title}` : row.title}
			{@const detail =
				row.kind === 'attempted'
					? facts(row)
					: ['Angesehen, kein eigener Versuch. Zählt nicht als Beleg.']}
			<ReadAloud.Segment
				as="li"
				say={[title, date, ...detail, speakRichText(row.criterion ?? '')]
					.filter(Boolean)
					.join('. ')}
			>
				<details>
					<summary class="activity-row">
						<span class="activity-row-number type-meta" aria-hidden="true">
							{String(index + 1).padStart(2, '0')}
						</span>
						<span>
							<span class="activity-row-title type-title">{row.title}</span>
							<span class="activity-row-meta type-meta">
								<time datetime={row.recordedAt}>{date}</time>
								{#if row.origin === 'live'}
									· Neu{/if}
							</span>
						</span>
						<span class="activity-row-arrow" aria-hidden="true"><Icon name="arrow-right" /></span>
					</summary>
					<div class="activity-row-detail">
						<p>{detail.join(' · ')}</p>
						{#if row.criterion}
							<p><RichText text={row.criterion} /></p>
						{/if}
					</div>
				</details>
			</ReadAloud.Segment>
		{/each}
	</ol>
{:else}
	<p class="activity-note">Hier erscheinen deine Versuche und angesehenen Beispiele.</p>
{/if}
