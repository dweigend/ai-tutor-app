import { getContext, setContext } from 'svelte';

/** The canvas a mark draws into: its viewBox size, so HTML callouts can sit at the same spot. */
export interface CanvasContext {
	readonly width: number;
	readonly height: number;
	readonly viewBox: string;
}

const KEY = Symbol('figure-plate-canvas');

export function setCanvasContext(context: CanvasContext): void {
	setContext(KEY, context);
}

/** Outside a Canvas a mark draws into the plate's default 320 × 200. */
export function getCanvasContext(): CanvasContext {
	return (
		getContext<CanvasContext | undefined>(KEY) ?? {
			width: 320,
			height: 200,
			viewBox: '0 0 320 200'
		}
	);
}
