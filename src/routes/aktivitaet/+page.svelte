<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import type { ActivityMirrorSnapshot } from '$lib/api/types';
	import ConceptGroups from '$lib/components/aktivitaet/ConceptGroups.svelte';
	import RhythmMatrix from '$lib/components/aktivitaet/RhythmMatrix.svelte';
	import {
		conceptEvidence,
		localDate,
		practiceCourses,
		type CalendarPoint
	} from '$lib/components/aktivitaet/mirror';
	import { todayProgress } from '$lib/components/home/progress';
	import { activityMirror } from '$lib/content';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import { PageHead } from '$lib/modules';

	const tutorApp = getTutorAppContext();
	const courses = practiceCourses(activityMirror.course);
	let snapshots = $state.raw<ActivityMirrorSnapshot[]>([]);
	let failed = $state(false);

	$effect(() => {
		const route = page.url.pathname;
		untrack(() =>
			screenContext.setScreen({
				route,
				topic: 'Aktivität',
				courseId: activityMirror.course.courseId
			})
		);
	});

	$effect(() => {
		snapshots = [];
		failed = false;
		if (tutorApp.switching) return;

		const client = tutorApp.client;
		const controller = new AbortController();
		for (const course of courses) {
			void client.getActivityMirror(course, controller.signal).then(
				(snapshot) => {
					if (!controller.signal.aborted) snapshots = [...snapshots, snapshot];
				},
				() => {
					if (!controller.signal.aborted) failed = true;
				}
			);
		}
		return () => controller.abort();
	});

	let today = $derived(tutorApp.todayDayKey);
	let progress = $derived(todayProgress(tutorApp.todayCompleted, tutorApp.todayTarget));
	let steps = $derived(
		Array.from({ length: progress.target }, (_, index) => index < progress.completed)
	);
	let mode = $derived(tutorApp.switching ? 'http' : tutorApp.config.mode);
	let liveEvidence = $derived(conceptEvidence(snapshots));
	let months = $derived(
		calendarMonths(
			snapshots.flatMap(({ recentPractice }) =>
				recentPractice.map(({ recordedAt }) => localDate(recordedAt))
			),
			today
		)
	);

	function conceptLabel(conceptId: string): string {
		return (
			activityMirror.concepts.find((concept) => concept.conceptId === conceptId)?.label ?? conceptId
		);
	}

	/** Seed months, the current calendar month, plus any month with live practice. */
	function calendarMonths(liveDates: readonly string[], currentDay: string) {
		const byMonth = new Map<string, CalendarPoint[]>();
		for (const { month, points } of mode === 'mock' ? activityMirror.monthlyPoints : []) {
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

<div data-surface="paper">
	<div class="activity-head"><PageHead accent="activity" title="Aktivität" /></div>
	<div class="activity">
		<section
			class="today"
			data-section-id="heute"
			data-section-title="Heute"
			aria-labelledby="heute"
		>
			<h2 id="heute" class="visually-hidden">Heute</h2>
			<div class="day" role="img" aria-label={progress.label}>
				{#each steps as finished, index (index)}
					<span class="step" data-done={finished ? '' : undefined}></span>
				{/each}
			</div>
		</section>
		<ConceptGroups concepts={activityMirror.concepts} {liveEvidence} {mode} />
		<section class="rhythm" data-section-id="rhythm" aria-labelledby="rhythm">
			<h2 id="rhythm" class="type-title">Rhythmus</h2>
			<RhythmMatrix {months} {today} />
		</section>
		{#if failed}<p class="type-meta error" role="status">Gerade nicht alles geladen.</p>{/if}
	</div>
</div>

<style>
	.activity-head {
		position: sticky;
		inset-block-start: 0;
		z-index: 10;
	}

	.activity {
		max-inline-size: var(--content-width);
		margin-inline: auto;
		display: grid;
		gap: var(--space-l);
		padding: 0 var(--gutter) var(--space-l);
	}

	.day {
		display: flex;
		flex-direction: column-reverse;
		block-size: clamp(9rem, 22vw, 13rem);
		background: var(--type-today);
		color: var(--type-today-text);
	}

	.step {
		display: grid;
		flex: 1;
		align-items: center;
	}

	.step::before {
		block-size: var(--edge-width);
		background: currentColor;
		content: '';
	}

	.step[data-done]::before {
		block-size: 62%;
	}

	@media (forced-colors: active) {
		.step::before {
			background: CanvasText;
		}
	}

	.rhythm h2 {
		margin-block-end: var(--space-m);
	}

	.error {
		margin: 0;
	}

	@media (min-width: 56rem) {
		.activity {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
			align-items: start;
		}

		.today,
		.error {
			grid-column: 1 / -1;
		}
	}
</style>
