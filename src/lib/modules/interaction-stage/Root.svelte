<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { budgetGuard } from '../core/budget.js';
	import { Scope } from '../read-aloud/index.js';
	import { setStageContext, type StageState } from './context.js';

	interface Props {
		state: StageState;
		/** 1-based number of this step and the count of all steps of the task. */
		step?: number;
		steps?: number;
		/** Work uses paper, white or ink (DESIGN.md §5.9). Null inherits the host surface. */
		surface?: 'paper' | 'white' | 'ink' | null;
		/** Name of the stage for assistive technology and the budget report. */
		label: string;
		/** Enter or the primary key while `ready`. */
		oncommit?: () => void;
		/**
		 * Escape leaves the stage (one stage per screen, so the window listens). Order: an open
		 * "Mehr" closes first; a begun answer (`dirty`) asks before it is dropped; else it leaves.
		 */
		onexit?: () => void;
		/** An answer is begun but not sent: Escape asks "Bleiben" or "Verlassen" first. */
		dirty?: boolean;
		children: Snippet;
	}

	let {
		state: stageState,
		step = 1,
		steps = 1,
		surface = 'paper',
		label,
		oncommit,
		onexit,
		dirty = false,
		children
	}: Props = $props();

	const id = $props.id();
	let form = $state<HTMLFormElement>();
	let moreOpen = $state(false);
	let leaving = $state(false);
	let stayKey = $state<HTMLButtonElement>();
	/** Where the focus was before the leave question took it. */
	let returnFocus: HTMLElement | null = null;

	/* A new step and the reveal start with "Mehr" closed; a new step also drops the question. */
	$effect(() => {
		void step;
		untrack(() => {
			moreOpen = false;
			leaving = false;
		});
	});
	$effect(() => {
		if (stageState === 'revealed') untrack(() => (moreOpen = false));
	});

	$effect(() => {
		if (leaving) stayKey?.focus();
	});

	setStageContext({
		get state() {
			return stageState;
		},
		get step() {
			return step;
		},
		get steps() {
			return steps;
		},
		get moreOpen() {
			return moreOpen;
		},
		set moreOpen(open) {
			moreOpen = open;
		},
		get leaving() {
			return leaving;
		},
		get blocked() {
			return moreOpen || leaving;
		}
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (stageState === 'ready' && !moreOpen && !leaving) oncommit?.();
	}

	function closeMore() {
		const trigger = form?.querySelector<HTMLElement>('.stage-more > .fold-trigger');
		const inside = form?.querySelector('.stage-more-content')?.contains(document.activeElement);
		moreOpen = false;
		if (inside) trigger?.focus();
	}

	async function stay() {
		const previousFocus = returnFocus;
		leaving = false;
		returnFocus = null;
		await tick();
		previousFocus?.focus();
	}

	function leave() {
		leaving = false;
		returnFocus = null;
		onexit?.();
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		if (leaving) {
			event.preventDefault();
			stay();
			return;
		}
		if (moreOpen) {
			event.preventDefault();
			closeMore();
			return;
		}
		if (!onexit) return;
		event.preventDefault();
		if (dirty) {
			returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			leaving = true;
			return;
		}
		onexit();
	}
</script>

<!--
	InteractionStage: meter, head, instrument, aside and a 56px action in its own zone. The stage is a form; it is its own ReadAloud scope. In dev builds the budget
	guard measures lines, overflow and targets in the browser (core/budget.ts).
-->
<svelte:window onkeydown={keydown} />

<Scope>
	<form
		class="stage"
		data-surface={surface ?? undefined}
		data-state={stageState}
		aria-label={label}
		aria-busy={stageState === 'pending'}
		novalidate
		onsubmit={submit}
		bind:this={form}
		{@attach budgetGuard(import.meta.env?.DEV === true, () => label)}
	>
		{@render children()}
		{#if leaving}
			<!-- Escape on a begun answer: one calm question in place of the base, never a browser dialog. -->
			<div
				class="stage-leave"
				role="alertdialog"
				aria-modal="false"
				aria-labelledby="{id}-leave"
				data-budget="zone"
			>
				<p class="stage-leave-ask" id="{id}-leave">Antwort verwerfen?</p>
				<div class="stage-leave-keys">
					<button
						type="button"
						class="m-key m-keyword stage-leave-key"
						bind:this={stayKey}
						onclick={stay}
					>
						Bleiben
					</button>
					<button type="button" class="m-hit m-keyword stage-leave-key" onclick={leave}>
						Verlassen
					</button>
				</div>
			</div>
		{/if}
	</form>
</Scope>
