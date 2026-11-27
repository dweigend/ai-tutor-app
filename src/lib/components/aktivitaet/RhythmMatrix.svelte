<script lang="ts">
	import { ReadAloud } from '$lib/modules';
	import type { CalendarPoint } from './mirror';
	import { rhythmWeeks } from './rhythm';

	interface Props {
		months: readonly { month: string; points: readonly CalendarPoint[] }[];
		/** `YYYY-MM-DD` */
		today: string;
	}

	let { months, today }: Props = $props();

	const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
	const dayFormat = new Intl.DateTimeFormat('de-DE', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	let weeks = $derived(rhythmWeeks(months, today));
	let rows = $derived.by(() => {
		const points = months.flatMap((entry) => entry.points);
		const dates = [...new Set([...points.map((point) => point.date), today])].sort();
		return dates.map((date) => {
			const point = points.find((entry) => entry.date === date);
			const state = [
				date === today ? 'heute' : undefined,
				point ? (point.kind === 'practiced' ? 'geübt' : 'geplant') : undefined
			].filter(Boolean);
			return {
				date,
				label: dayFormat.format(new Date(`${date}T12:00:00`)),
				state: state.join(', ') || 'frei',
				concepts: point?.labels.join(', ') ?? ''
			};
		});
	});
</script>

<ReadAloud.Segment as="p" class="rhythm-legend">
	<span><i class="dot" data-kind="practiced" aria-hidden="true"></i> Geübt</span>
	<span><i class="dot" data-kind="planned" aria-hidden="true"></i> Geplant</span>
	<span><i class="dot" data-kind="open" aria-hidden="true"></i> Frei</span>
	<span><i class="dot" data-kind="open" data-today aria-hidden="true"></i> Heute</span>
</ReadAloud.Segment>
<div class="rhythm" aria-hidden="true">
	<span class="corner"></span>
	{#each WEEKDAYS as weekday (weekday)}
		<span class="weekday">{weekday}</span>
	{/each}
	{#each weeks as week (week.days[0].date)}
		<span class="month">{week.label ?? ''}</span>
		{#each week.days as day (day.date)}
			<span class="cell">
				{#if day.inRange}
					<i class="dot" data-kind={day.kind ?? 'open'} data-today={day.isToday || undefined}></i>
				{/if}
			</span>
		{/each}
	{/each}
</div>
<!-- A table ignores a 1px box; the wrapper keeps it from widening the page. -->
<div class="visually-hidden">
	<table>
		<caption>Rhythmus nach Tagen</caption>
		<thead>
			<tr>
				<th scope="col">Datum</th>
				<th scope="col">Stand</th>
				<th scope="col">Konzepte</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.date)}
				<tr aria-current={row.date === today ? 'date' : undefined}>
					<th scope="row">{row.label}</th>
					<td>{row.state}</td>
					<td>{row.concepts}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.rhythm,
	:global(.rhythm-legend) {
		--rhythm-dot: var(--tool-dot);
		font-family: var(--font-ui);
		font-size: var(--type-label);
		line-height: var(--line-label);
	}

	:global(.rhythm-legend) {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-s) var(--space-m);
		margin-block-end: var(--space-m);
	}

	:global(.rhythm-legend) span {
		display: inline-flex;
		align-items: center;
		gap: var(--space-s);
	}

	.rhythm {
		display: grid;
		grid-template-columns: max-content repeat(7, minmax(0, 1fr));
		grid-auto-rows: var(--icon-size);
		align-items: center;
		justify-items: center;
		column-gap: var(--dot-gap);
		max-inline-size: 18rem;
	}

	.weekday {
		color: var(--text-muted);
	}

	.month {
		justify-self: start;
		padding-inline-end: var(--space-s);
		font-weight: var(--font-weight-strong);
		letter-spacing: var(--letter-label);
	}

	.cell {
		display: grid;
		place-items: center;
	}

	.dot {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: var(--rhythm-dot);
		block-size: var(--rhythm-dot);
		border: var(--icon-stroke) solid var(--hairline);
		border-radius: 50%;
	}

	.dot[data-kind='practiced'] {
		background: var(--text);
	}

	.dot[data-kind='planned']::before {
		content: '';
		inline-size: var(--dot-off);
		block-size: var(--dot-off);
		border-radius: 50%;
		background: currentColor;
	}

	.dot[data-today] {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--dot-gap);
	}
</style>
