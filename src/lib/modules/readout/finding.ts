import type { Finding } from './types.js';

/** Plain words of a finding, no verdict colours. A deviation is information, never "falsch". */
export const FINDING_WORDS: Readonly<Record<Finding, string>> = {
	match: 'trifft zu',
	partial: 'weicht teilweise ab',
	deviates: 'weicht ab',
	open: 'nicht beurteilbar'
};

/** True for the findings that show the crimson bar (DESIGN.md §5.4). */
export function isDeviation(finding: Finding): boolean {
	return finding === 'deviates' || finding === 'partial';
}
