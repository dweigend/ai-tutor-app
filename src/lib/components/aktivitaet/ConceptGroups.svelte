<script lang="ts">
	import type { ApiMode } from '$lib/api/types';
	import { activityStatusCopy, activityQueueTopics } from '$lib/content/aktivitaet';
	import type { ActivityConcept } from '$lib/content';
	import {
		LEARNING_QUEUE_EVENT,
		LEARNING_QUEUE_KEY,
		readLearningQueue,
		toggleLearningQueue
	} from '$lib/learning-queue';
	import { IconButton, ReadAloud, StatusSignal } from '$lib/modules';
	import { routeOpensInMode } from '../uebungen/stage-model';
	import { resolveConceptStatus, type LiveObservation } from './mirror';

	let {
		concepts,
		liveEvidence,
		mode
	}: {
		concepts: readonly ActivityConcept[];
		liveEvidence: readonly LiveObservation[];
		mode: ApiMode;
	} = $props();

	const signals = {
		eingereicht_ungeprueft: 'neutral',
		noch_zu_wenig_gesehen: 'neutral',
		nicht_gekonnt: 'bad',
		mit_hilfe_gelungen: 'mid',
		beherrscht: 'good',
		übertragbar: 'good'
	} as const;

	let queued = $state(new Set<string>());
	let queueError = $state(false);
	let ready = $state(false);

	const storage = {
		getItem: (key: string) => window.localStorage.getItem(key),
		setItem: (key: string, value: string) => window.localStorage.setItem(key, value)
	};

	function refreshQueue() {
		const items = readLearningQueue(storage);
		queueError = items === undefined;
		queued = new Set((items ?? []).map(({ id }) => id));
	}

	/* One place for both listeners: this tab's event and changes from other tabs. */
	$effect(() => {
		const onStorage = (event: StorageEvent) => {
			if (event.key === LEARNING_QUEUE_KEY || event.key === null) refreshQueue();
		};
		refreshQueue();
		ready = true;
		window.addEventListener(LEARNING_QUEUE_EVENT, refreshQueue);
		window.addEventListener('storage', onStorage);
		return () => {
			window.removeEventListener(LEARNING_QUEUE_EVENT, refreshQueue);
			window.removeEventListener('storage', onStorage);
		};
	});

	function toggle(conceptId: string, topic: (typeof activityQueueTopics)[string]) {
		const items = toggleLearningQueue(storage, window, {
			id: `activity:${conceptId}`,
			...topic
		});
		if (!items) queueError = true;
	}
</script>

<section
	class="learning"
	data-section-id="concepts"
	data-section-title="Lernstand"
	aria-labelledby="concepts"
>
	<h2 id="concepts" class="type-title">Lernstand</h2>
	<ul role="list">
		{#each concepts as concept (concept.conceptId)}
			{@const status = resolveConceptStatus(concept, liveEvidence, mode)}
			{@const label =
				status === 'eingereicht_ungeprueft'
					? 'Eingereicht, noch ungeprüft'
					: activityStatusCopy[status].label}
			{@const topic = activityQueueTopics[concept.conceptId]}
			{@const selected = queued.has(`activity:${concept.conceptId}`)}
			<li>
				<ReadAloud.Segment say="{concept.label}. {label}.">
					<span>{concept.label}</span>
				</ReadAloud.Segment>
				<StatusSignal status={signals[status]} {label} />
				<!-- Live, a topic that leads to a locked Modul-2 task (AP6) offers no queue button. -->
				{#if topic && routeOpensInMode(topic.route, mode)}
					<IconButton
						icon={selected ? 'check' : 'plus'}
						label="{concept.label} zur Lernliste"
						active={selected}
						disabled={!ready}
						onclick={() => toggle(concept.conceptId, topic)}
					/>
				{/if}
			</li>
		{/each}
	</ul>
	{#if queueError}<p role="status" class="type-meta">
			Lernliste konnte nicht gespeichert werden.
		</p>{/if}
</section>

<style>
	.learning {
		min-inline-size: 0;
	}

	h2 {
		margin: 0 0 var(--space-s);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) max-content var(--hit);
		align-items: center;
		gap: var(--space-s);
		min-block-size: var(--row);
		padding: var(--space-s) 0;
		border-block-end: var(--hairline-width) solid var(--well);
		font-size: var(--type-body);
		line-height: var(--line-title);
		overflow-wrap: anywhere;
	}
</style>
