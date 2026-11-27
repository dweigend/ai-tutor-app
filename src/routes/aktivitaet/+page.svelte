<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import { ApiError, type ActivityMirrorSnapshot, type CourseRef } from '$lib/api/types';
	import ProgressDial from '$lib/components/aktivitaet/ProgressDial.svelte';
	import { ReadAloud, SurfaceShell } from '$lib/modules';
	import { areaFor, areaNumber } from '$lib/navigation';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import ConceptGroups from '$lib/components/aktivitaet/ConceptGroups.svelte';
	import EvidenceList from '$lib/components/aktivitaet/EvidenceList.svelte';
	import PlannedPractice from '$lib/components/aktivitaet/PlannedPractice.svelte';
	import RhythmMatrix from '$lib/components/aktivitaet/RhythmMatrix.svelte';
	import {
		liveEvidence,
		localDate,
		newestFirst,
		practiceCourses,
		seedRows,
		type CalendarPoint
	} from '$lib/components/aktivitaet/mirror';
	import { activityMirror, activityMirrorNotes } from '$lib/content';

	const area = '/aktivitaet';
	const entry = areaFor(area);
	const heading = 'Was ohne Hilfe trägt';
	const tutorApp = getTutorAppContext();
	const courses = practiceCourses(activityMirror.course);
	$effect(() => {
		const route = page.url.pathname;
		untrack(() =>
			screenContext.setScreen({ route, topic: heading, courseId: activityMirror.course.courseId })
		);
	});
	let today = $derived(tutorApp.todayDayKey);

	let snapshots = $state.raw<ActivityMirrorSnapshot[]>([]);
	let loadState = $state<'loading' | 'ready' | 'error'>('loading');
	let failedCourses = $state.raw<string[]>([]);
	let loadError = $state('');

	function courseLabel(course: CourseRef): string {
		return `${course.courseId} (${course.courseVersion})`;
	}

	// Refetch whenever the client changes (demo or live API); abort a stale request.
	// Each course stands on its own: answers show as they arrive, failures are named per course.
	$effect(() => {
		if (tutorApp.switching) {
			snapshots = [];
			failedCourses = [];
			loadError = '';
			loadState = 'loading';
			return;
		}
		const client = tutorApp.client;
		const controller = new AbortController();
		snapshots = [];
		failedCourses = [];
		loadError = '';
		loadState = 'loading';
		const requests = courses.map((course) =>
			client.getActivityMirror(course, controller.signal).then((snapshot) => {
				if (!controller.signal.aborted) snapshots = [...snapshots, snapshot];
				return snapshot;
			})
		);
		void Promise.allSettled(requests).then((results) => {
			if (controller.signal.aborted) return;
			const failed = results.flatMap((result, index) =>
				result.status === 'rejected' ? [{ course: courses[index], reason: result.reason }] : []
			);
			failedCourses = failed.map((entry) => courseLabel(entry.course));
			const first = failed[0]?.reason;
			loadError =
				first instanceof ApiError
					? first.problem.message
					: 'Der Lernstand ist gerade nicht erreichbar.';
			loadState = failed.length ? 'error' : 'ready';
		});
		return () => controller.abort();
	});

	let live = $derived(liveEvidence(snapshots, activityMirror));
	let rows = $derived(newestFirst([...live.rows, ...seedRows(activityMirror)]));
	let attemptDates = $derived(
		new Map(
			activityMirror.observations.flatMap((observation) =>
				observation.kind === 'attempted'
					? [[observation.attemptId, observation.recordedAt] as const]
					: []
			)
		)
	);
	let months = $derived(
		calendarMonths(
			live.rows.map((row) => localDate(row.recordedAt)),
			today
		)
	);
	let todayDone = $derived(Math.min(tutorApp.todayCompleted, tutorApp.todayTarget));

	function conceptLabel(conceptId: string): string {
		return (
			activityMirror.concepts.find((concept) => concept.conceptId === conceptId)?.label ?? conceptId
		);
	}

	/** Seed months, the current calendar month, plus any month with live practice. */
	function calendarMonths(liveDates: readonly string[], currentDay: string) {
		const byMonth = new Map<string, CalendarPoint[]>();
		for (const { month, points } of activityMirror.monthlyPoints) {
			byMonth.set(
				month,
				points.map((point) => ({
					date: point.date,
					kind: point.kind,
					labels: point.conceptIds.map(conceptLabel)
				}))
			);
		}
		const currentMonth = currentDay.slice(0, 7);
		if (!byMonth.has(currentMonth)) byMonth.set(currentMonth, []);
		for (const date of new Set(liveDates)) {
			const month = date.slice(0, 7);
			const points = (byMonth.get(month) ?? []).filter((point) => point.date !== date);
			byMonth.set(month, [...points, { date, kind: 'practiced', labels: ['neu geübt'] }]);
		}
		return [...byMonth.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([month, points]) => ({ month, points }));
	}
</script>

<svelte:head>
	<title>Aktivität | Tutor</title>
</svelte:head>

<SurfaceShell.Root tone={entry.surface}>
	<SurfaceShell.Body>
		<header class="activity-header" data-section-id="heute" data-section-title="Lernschritte heute">
			<div class="header-top">
				<span class="type-label">{areaNumber(area)} / {entry.label}</span>
				<SurfaceShell.Actions>
					<ReadAloud.Trigger />
					<SurfaceShell.Grid href={resolve('/')} />
				</SurfaceShell.Actions>
			</div>
			<h1 class="type-head">{heading}</h1>
			<ReadAloud.Segment
				as="section"
				class="activity-today"
				say="Heute. {todayDone} von {tutorApp.todayTarget} Lernschritten."
			>
				<ProgressDial done={todayDone} planned={tutorApp.todayTarget} />
				<h2 class="type-label">Lernschritte heute</h2>
			</ReadAloud.Segment>
		</header>

		<div class="activity-content" data-surface="paper">
			<div class="sheet">
				<ConceptGroups
					concepts={activityMirror.concepts}
					liveEvidence={live.evidence}
					{attemptDates}
				/>

				<div class="planning">
					<PlannedPractice
						concepts={activityMirror.concepts}
						monthlyPoints={activityMirror.monthlyPoints}
					/>

					<section data-section-id="rhythm" aria-labelledby="rhythm">
						<h2 id="rhythm" class="type-label">Rhythmus</h2>
						<ReadAloud.Segment as="p" class="activity-note">
							{activityMirrorNotes.rhythm}
						</ReadAloud.Segment>
						<RhythmMatrix {months} {today} />
					</section>
				</div>

				<section class="evidence" data-section-id="evidence" aria-labelledby="evidence">
					<h2 id="evidence" class="type-label">Belege</h2>
					<ReadAloud.Segment as="p" class="activity-note">
						{activityMirrorNotes.evidence}
						{activityMirrorNotes.confidence}
					</ReadAloud.Segment>
					<div role="status" class="sync">
						<ReadAloud.Segment as="p">
							{#if loadState === 'loading'}
								Neue Belege werden geladen …
							{:else if loadState === 'error' && failedCourses.length === courses.length}
								{loadError} Die Liste zeigt den gespeicherten Stand.
							{:else if loadState === 'error'}
								{live.rows.length}
								{live.rows.length === 1 ? 'neuer Beleg' : 'neue Belege'} geladen. Nicht erreichbar:
								{failedCourses.join(', ')}. {loadError}
							{:else if live.rows.length}
								{live.rows.length}
								{live.rows.length === 1 ? 'neuer Beleg' : 'neue Belege'} aus dieser Sitzung
							{:else}
								Keine neuen Belege in dieser Sitzung.
							{/if}
						</ReadAloud.Segment>
					</div>
					<EvidenceList {rows} />
				</section>
			</div>
		</div>
	</SurfaceShell.Body>
</SurfaceShell.Root>

<style>
	.activity-header,
	.sheet {
		max-inline-size: var(--content-width);
		margin-inline: auto;
	}

	.activity-header {
		padding: var(--space-s) var(--gutter) var(--space-m);
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-s);
	}

	.header-top :global(.shell-actions) {
		padding-inline-end: 0;
	}

	h1 {
		margin-block: var(--space-m);
		letter-spacing: normal;
	}

	.activity-header :global(.activity-today) {
		display: flex;
		align-items: center;
		gap: var(--space-m);
		padding-block-start: var(--space-m);
		border-block-start: var(--hairline-width) solid var(--hairline);
	}

	.activity-content {
		background: var(--surface);
		color: var(--text);
		padding-bottom: 96px;
	}

	.sheet {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}

	.planning > section,
	.evidence {
		min-inline-size: 0;
		padding: var(--gutter);
		border-block-start: var(--hairline-width) solid var(--hairline);
	}

	.activity-content :global(h2) {
		scroll-margin-block-start: var(--bar);
	}

	.activity-content :global(.activity-note) {
		max-inline-size: 64ch;
		margin-block: var(--space-s) var(--space-m);
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.sync {
		margin-block: var(--space-s) var(--space-m);
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.activity-content :global(.activity-rows) {
		margin: 0;
		padding: 0;
		list-style: none;
		border-block-end: var(--hairline-width) solid var(--hairline);
	}

	.activity-content :global(.activity-rows > li) {
		border-block-start: var(--hairline-width) solid var(--hairline);
	}

	.activity-content :global(.activity-row) {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr) var(--arrow-circle-size);
		align-items: center;
		gap: var(--space-s);
		min-block-size: var(--row);
		padding-block: var(--space-s);
		font-family: var(--font-ui);
		font-variant-numeric: tabular-nums;
		text-decoration: none;
		overflow-wrap: anywhere;
		cursor: pointer;
		touch-action: manipulation;
	}

	.activity-content :global(.activity-row::-webkit-details-marker) {
		display: none;
	}

	.activity-content :global(.activity-row:focus-visible) {
		outline-offset: calc(-1 * var(--focus-width));
	}

	.activity-content :global(.activity-row-title),
	.activity-content :global(.activity-row-meta) {
		display: block;
	}

	.activity-content :global(.activity-row-meta),
	.activity-content :global(.activity-row-number) {
		color: var(--text-muted);
	}

	.activity-content :global(.activity-row-arrow) {
		display: grid;
		place-items: center;
		inline-size: var(--arrow-circle-size);
		block-size: var(--arrow-circle-size);
		border: var(--hairline-width) solid currentColor;
		border-radius: 50%;
	}

	.activity-content :global(.activity-row:hover .activity-row-arrow),
	.activity-content :global(.activity-row:focus-visible .activity-row-arrow) {
		background: var(--action);
		color: var(--action-text);
	}

	.activity-content :global(details[open] > .activity-row .activity-row-arrow) {
		rotate: 90deg;
	}

	.activity-content :global(.activity-row-detail) {
		max-inline-size: 64ch;
		padding: var(--space-s) 0 var(--space-m) calc(2rem + var(--space-s));
		overflow-wrap: anywhere;
	}

	.activity-content :global(.activity-row-detail > p + p) {
		margin-block-start: var(--space-s);
	}

	@media (min-width: 60rem) {
		.sheet {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			border-inline: var(--hairline-width) solid var(--hairline);
		}

		.planning {
			border-inline-start: var(--hairline-width) solid var(--hairline);
		}

		.evidence {
			grid-column: 1 / -1;
		}
	}
</style>
