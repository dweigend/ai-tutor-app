/** P6 Readout: everything the device shows. Readouts tick; none tweens its value. */
export { default as Facts } from './Facts.svelte';
export { default as Matrix } from './Matrix.svelte';
export { default as Meter } from './Meter.svelte';
export { default as Value } from './Value.svelte';
export { default as Verdict } from './Verdict.svelte';
export { FINDING_WORDS, isDeviation } from './finding.js';
export type { CodeSide, Fact, FactsData, Finding, PairSide } from './types.js';
