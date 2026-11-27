/** One day of the rhythm matrix: a circle, without a day number (DESIGN.md §3.3). */
export interface RhythmDay {
	/** `YYYY-MM-DD` */
	date: string;
	/** False for days before the first or after the last month shown. */
	inRange: boolean;
	kind?: 'planned' | 'practiced';
	isToday: boolean;
}

/** One row of the matrix: Monday to Sunday. */
export interface RhythmWeek {
	/** Short month label on the row that holds the first of a month. */
	label?: string;
	days: RhythmDay[];
}

interface MonthPoints {
	/** `YYYY-MM` */
	month: string;
	points: readonly { date: string; kind: 'planned' | 'practiced' }[];
}

const MONTH_LABELS = [
	'JAN',
	'FEB',
	'MÄR',
	'APR',
	'MAI',
	'JUN',
	'JUL',
	'AUG',
	'SEP',
	'OKT',
	'NOV',
	'DEZ'
] as const;

function isoDate(date: Date): string {
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Lays the given months out as one continuous week matrix, Monday first. Days outside the
 * months stay empty; the first of each month names its row (`OKT`, `NOV`, `DEZ`).
 */
export function rhythmWeeks(months: readonly MonthPoints[], today: string): RhythmWeek[] {
	if (!months.length) return [];
	const sorted = [...months].sort((left, right) => left.month.localeCompare(right.month));
	const kinds = new Map(sorted.flatMap(({ points }) => points.map((p) => [p.date, p.kind])));
	const [firstYear, firstMonth] = sorted[0].month.split('-').map(Number);
	const [lastYear, lastMonth] = sorted[sorted.length - 1].month.split('-').map(Number);
	const first = new Date(Date.UTC(firstYear, firstMonth - 1, 1));
	const last = new Date(Date.UTC(lastYear, lastMonth, 0));
	const shown = new Set(sorted.map(({ month }) => month));

	const cursor = new Date(first);
	cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
	const weeks: RhythmWeek[] = [];
	while (cursor <= last) {
		const week: RhythmWeek = { days: [] };
		for (let weekday = 0; weekday < 7; weekday += 1) {
			const date = isoDate(cursor);
			const inRange = cursor >= first && cursor <= last && shown.has(date.slice(0, 7));
			if (inRange && cursor.getUTCDate() === 1) {
				week.label = MONTH_LABELS[cursor.getUTCMonth()];
			}
			week.days.push({
				date,
				inRange,
				kind: inRange ? kinds.get(date) : undefined,
				isToday: inRange && date === today
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		weeks.push(week);
	}
	return weeks;
}
