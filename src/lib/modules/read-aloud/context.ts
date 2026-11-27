import { getContext, setContext } from 'svelte';
import type { ReadAloudController, ReadAloudState } from './controller.js';

const PROVIDER_KEY = Symbol('read-aloud');
const SCOPE_KEY = Symbol('read-aloud-scope');

/** The provider's controller plus its state as Svelte reads it (a $state mirror). */
export interface ReadAloudContext {
	controller: ReadAloudController;
	readonly state: ReadAloudState;
}

export interface ScopeContext {
	id: string;
	readonly lang: string;
}

export function setReadAloudContext(context: ReadAloudContext): void {
	setContext(PROVIDER_KEY, context);
}

/** Undefined outside a Provider: parts then render inert instead of failing. */
export function getReadAloudContext(): ReadAloudContext | undefined {
	return getContext<ReadAloudContext | undefined>(PROVIDER_KEY);
}

export function setScopeContext(context: ScopeContext): void {
	setContext(SCOPE_KEY, context);
}

export function getScopeContext(): ScopeContext | undefined {
	return getContext<ScopeContext | undefined>(SCOPE_KEY);
}
