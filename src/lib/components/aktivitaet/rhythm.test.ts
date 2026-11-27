import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('./') && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { rhythmWeeks } = await import('./rhythm.js');

const months = [
	{
		month: '2026-11',
		points: [
			{ date: '2026-11-12', kind: 'practiced' as const },
			{ date: '2026-11-27', kind: 'planned' as const }
		]
	},
	{ month: '2026-10', points: [{ date: '2026-10-06', kind: 'practiced' as const }] }
];

test('rhythm matrix runs Monday to Sunday across months without day numbers', () => {
	const weeks = rhythmWeeks(months, '2026-11-26');
	// 1 October 2026 is a Thursday; 30 November is a Monday.
	assert.equal(weeks[0].days[0].date, '2026-09-28');
	assert.equal(weeks[0].days[3].date, '2026-10-01');
	assert.equal(weeks.at(-1)?.days[0].date, '2026-11-30');
	assert.equal(weeks.at(-1)?.days[6].date, '2026-12-06');
	assert.ok(weeks.every((week) => week.days.length === 7));
	assert.deepEqual(
		weeks.flatMap((week) => (week.label ? [week.label] : [])),
		['OKT', 'NOV']
	);
});

test('rhythm matrix marks practiced, planned and today only inside the months shown', () => {
	const days = rhythmWeeks(months, '2026-11-26').flatMap((week) => week.days);
	const day = (date: string) => days.find((entry) => entry.date === date);
	assert.equal(day('2026-09-28')?.inRange, false);
	assert.equal(day('2026-12-01')?.inRange, false);
	assert.equal(day('2026-10-06')?.kind, 'practiced');
	assert.equal(day('2026-11-27')?.kind, 'planned');
	assert.equal(day('2026-11-13')?.kind, undefined);
	assert.deepEqual(
		days.filter((entry) => entry.isToday).map((entry) => entry.date),
		['2026-11-26']
	);
});

test('rhythm matrix is empty without months', () => {
	assert.deepEqual(rhythmWeeks([], '2026-11-26'), []);
});
