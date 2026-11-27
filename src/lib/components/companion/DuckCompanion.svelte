<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, tick } from 'svelte';
	import { getTutorAppContext } from '$lib/api/context.svelte';
	import type { TutorApiClient } from '$lib/api/types';
	import type { DuckPose } from '$lib/figures';
	import { findRelevantNotes } from '$lib/memory';
	import { learningMemory, screenContext } from '$lib/memory/runtime.svelte';
	import { animate, type Animation } from '$lib/modules';
	import DuckChip from '../duck/DuckChip.svelte';
	import DuckStage from '../duck/DuckStage.svelte';
	import { SWIPE_THRESHOLD, pullDistance, rubberBand, swipeOutcome } from '../duck/gesture';
	import { sameCompanionContent } from './companion-logic';
	import CompanionSheet from './CompanionSheet.svelte';
	import { topDrawer } from '../shell/top-drawer.svelte';

	/*
	 * The corner duck (issue #59): a free 3D figure in the bottom right corner of every page except
	 * `/tutor`, where the fullscreen duck takes its place. It sits at the same spot on every route
	 * and never jumps: every bottom bar reserves its corner (BottomBar `reserveDuck`). A tap gets a
	 * small reaction and one line; tapping that line opens the chat. Pulling up opens `/tutor`.
	 * It always wears the everyday look, so its 3D figure and its 2D still are the same duck on
	 * every route; the hipster easter egg lives on `/tutor` only.
	 * The duck stays mounted on `/tutor` too, only hidden: on the way back it is laid out and
	 * hit-testable in the very first frame instead of being built anew (P0-1).
	 */
	const drawer = topDrawer();
	const app = getTutorAppContext();
	const LINES = ['Hey du – was gibt’s?', 'Wo hakt’s?', 'Frag einfach.'];
	const PULL_CHIP = 'Loslassen: Tutor';
	const REACTIONS: DuckPose[] = ['nod', 'giggle'];
	const CHIP_MS = 5000;

	let trigger = $state<HTMLButtonElement>();
	let figure = $state<HTMLElement>();
	let opened = $state.raw<{
		screen: typeof screenContext.current;
		client: TutorApiClient;
	} | null>(null);
	let onTutor = $derived(page.route.id === '/tutor');
	let sameContent = $derived(
		opened &&
			sameCompanionContent(opened.screen, screenContext.current) &&
			opened.client === app.client &&
			opened.screen.route === page.url.pathname
	);
	$effect(() => {
		if (opened && (!sameContent || drawer.open || onTutor)) opened = null;
	});
	/* Back from `/tutor` the duck is hit-testable at once: no gesture or spring left over. */
	$effect(() => {
		if (!onTutor) return;
		spring?.stop();
		press = undefined;
		pulled = false;
		lift = 0;
		chip = null;
	});
	let hint = $derived(
		!screenContext.current.isIndependentProbe &&
			(!!screenContext.current.termId ||
				findRelevantNotes(screenContext.current, learningMemory.current.savedNotesAndQuestions)
					.length > 0)
	);

	let pose = $state<DuckPose>('wait'),
		cue = $state(0),
		taps = 0;
	let chip = $state<{ text: string; ask: boolean } | null>(null),
		chipTimer: ReturnType<typeof setTimeout> | undefined,
		chipHeld = false;

	onDestroy(() => {
		clearTimeout(chipTimer);
		spring?.stop();
	});

	function say(text: string, ask = true) {
		chip = { text, ask };
		chipHeld = false;
		armChip();
	}
	function armChip() {
		clearTimeout(chipTimer);
		if (!chipHeld) chipTimer = setTimeout(() => (chip = null), CHIP_MS);
	}
	function holdChip(held: boolean) {
		chipHeld = held;
		if (held) clearTimeout(chipTimer);
		else if (chip) armChip();
	}
	function react(next: DuckPose) {
		pose = next;
		cue++;
		if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
			figure?.animate([{ scale: '1' }, { scale: '1.16' }, { scale: '1' }], {
				duration: 320,
				easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)'
			});
	}
	function tap() {
		react(REACTIONS[taps % REACTIONS.length]);
		say(hint ? 'Dazu hab ich einen Tipp.' : LINES[taps % LINES.length]);
		taps++;
	}

	function open() {
		chip = null;
		chipHeld = false;
		learningMemory.refresh();
		opened = {
			screen: screenContext.current,
			client: app.client
		};
	}
	async function close() {
		opened = null;
		await tick();
		trigger?.focus({ preventScroll: true });
	}

	/* Pull up: the duck follows the finger with resistance and springs back below the threshold. */
	let lift = $state(0),
		press: { id: number; x: number; y: number } | undefined,
		pulled = false,
		spring: Animation | undefined;
	function down(event: PointerEvent) {
		if (press || !event.isPrimary || event.button !== 0) return;
		spring?.stop();
		pulled = false;
		press = { id: event.pointerId, x: event.clientX, y: event.clientY };
		trigger?.setPointerCapture(event.pointerId);
	}
	function move(event: PointerEvent) {
		if (press?.id !== event.pointerId) return;
		const dy = event.clientY - press.y;
		lift = rubberBand(pullDistance(dy, 'up'));
		if (-dy >= SWIPE_THRESHOLD && chip?.text !== PULL_CHIP) say(PULL_CHIP, false);
	}
	function release(event: PointerEvent, cancelled = false) {
		if (press?.id !== event.pointerId) return;
		const outcome = cancelled
			? 'rebound'
			: swipeOutcome(event.clientX - press.x, event.clientY - press.y, 'up');
		press = undefined;
		if (outcome !== 'tap') pulled = true;
		if (outcome === 'commit') {
			chip = null;
			void goto(resolve('/tutor'));
		} else if (chip?.text === PULL_CHIP) chip = null;
		spring = animate({
			from: lift,
			to: 0,
			preset: 'carry',
			restDelta: 0.5,
			onUpdate: (value) => (lift = value)
		});
	}
</script>

<div class="companion" hidden={onTutor}>
	<button
		bind:this={trigger}
		class="duck"
		aria-label="Tutor-Ente"
		aria-describedby="duck-companion-help"
		aria-expanded={!!sameContent}
		style:translate={lift ? `0 ${lift}px` : undefined}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={(event) => release(event)}
		onpointercancel={(event) => release(event, true)}
		onlostpointercapture={(event) => release(event, true)}
		onclick={() => {
			if (pulled) pulled = false;
			else tap();
		}}
	>
		<span class="figure" bind:this={figure}>
			<DuckStage
				variant="companion"
				figure="companion"
				interactive={false}
				idle
				{pose}
				{cue}
				onposedone={() => (pose = 'wait')}
			/>
		</span>
	</button>
	<!-- After the duck in tab order: Tab from the duck reaches the chip, which opens the chat. -->
	{#if chip && !sameContent}
		<div
			class="chip"
			role="presentation"
			onpointerenter={() => holdChip(true)}
			onpointerleave={() => holdChip(false)}
			onfocusin={() => holdChip(true)}
			onfocusout={() => holdChip(false)}
		>
			<DuckChip
				text={chip.text}
				onopen={chip.ask && !screenContext.current.isIndependentProbe ? open : undefined}
			/>
		</div>
	{/if}
	<span class="visually-hidden" aria-live="polite">{chip?.text ?? ''}</span>
	<span id="duck-companion-help" class="visually-hidden">
		Antippen, dann den Spruch antippen zum Fragen. Hochziehen für den Tutor.
	</span>
	{#if sameContent}
		<CompanionSheet
			share={app.shareWithApi}
			onshare={(enabled) => (app.shareWithApi = enabled)}
			onclose={close}
		/>
	{/if}
</div>

<style>
	/* One anchor on every route: the bottom right corner. It never moves; the chat stays 12 px
	   above the duck, the chip up and to its left, never on it. */
	.companion {
		display: contents;
		--companion-bottom: var(--duck-bottom);
		--companion-clearance: calc(
			var(--duck-bottom) + var(--duck-size) + var(--space-s) + var(--step-1)
		);
	}
	/* On `/tutor` the fullscreen duck takes over: hidden, out of the tab order and the a11y tree,
	   and the WebGL slot is released (DuckStage sees no intersection). */
	.companion[hidden] {
		display: none;
	}
	.companion > .visually-hidden {
		position: fixed;
		inset-block-start: 0;
	}
	.duck {
		position: fixed;
		z-index: var(--z-duck);
		right: var(--corner-inset);
		bottom: var(--companion-bottom);
		width: var(--duck-size);
		height: var(--duck-size);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		cursor: grab;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
		/* Its own layer in every route wipe: the duck stays put while the surface changes. */
		view-transition-name: duck-corner;
	}
	:global(::view-transition-group(duck-corner)) {
		z-index: var(--z-duck);
	}
	.duck:active {
		cursor: grabbing;
	}
	/* Yellow belongs to the duck: its focus shows on duck yellow, the ring keeps 3:1. */
	.duck:focus-visible {
		background: var(--popup-duck-bg);
	}
	.figure {
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	/* The chip sits up and to the left of the duck, a short gap from it, so it never covers the
	   action column of a list above the corner. Only the pill itself takes the pointer. */
	.chip {
		position: fixed;
		z-index: var(--z-popup);
		right: calc(var(--corner-inset) + var(--duck-size) + var(--step-1));
		bottom: calc(var(--companion-bottom) + var(--duck-size));
		display: flex;
		justify-content: flex-end;
		max-inline-size: calc(
			100vw - var(--corner-inset) - var(--duck-size) - var(--step-1) - var(--space-m)
		);
		pointer-events: none;
	}
	@media (max-width: 63.99rem) {
		.chip {
			bottom: calc(var(--duck-bottom) + 14px);
			right: calc(var(--corner-clearance) + var(--step-1));
		}
	}
	.chip > :global(.duck-chip) {
		pointer-events: auto;
	}
</style>
