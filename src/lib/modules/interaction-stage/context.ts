import { getContext, setContext } from 'svelte';

/**
 * States of a stage (ui/DESIGN.md §11 P2): open (nothing chosen) → ready (an answer stands) →
 * pending (on its way) → revealed (DU / BEFUND in place of the instrument).
 */
export type StageState = 'open' | 'ready' | 'pending' | 'revealed';

export interface StageContext {
	readonly state: StageState;
	readonly step: number;
	readonly steps: number;
	/** "Mehr" lies open over instrument, aside and action. */
	moreOpen: boolean;
	/** True while the leave question is open. */
	readonly leaving: boolean;
	/** True while "Mehr" or the leave question covers the stage: the zones below are inert. */
	readonly blocked: boolean;
}

const KEY = Symbol('interaction-stage');

export function setStageContext(context: StageContext): void {
	setContext(KEY, context);
}

export function getStageContext(): StageContext | undefined {
	return getContext<StageContext | undefined>(KEY);
}
