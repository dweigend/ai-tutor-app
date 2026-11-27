<script lang="ts">
	import { gsap } from 'gsap';
	import { tick, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { topDrawer } from '$lib/components/shell/top-drawer.svelte';
	import { explainDecks, type DeckControl } from '$lib/content/tutorials';
	import {
		computeBackpropDeckState,
		type AttentionDeckParams,
		type BackpropDeckParams,
		type BackpropNode
	} from '$lib/figures';
	import {
		attentionBubbles,
		attentionSlotOrder,
		attentionTerms,
		deckTermIds,
		type AttentionBubble,
		type DeckTerm
	} from '$lib/math/attention-terms';
	import { screenContext } from '$lib/memory/runtime.svelte';
	import { BottomBar, IconButton, PageHead, RichText, plainRichText } from '$lib/modules';
	import BubbleBoard from './BubbleBoard.svelte';
	import { EMPTY_MATCH, type MatchState } from './bubble-match';
	import { flashCorrect, reducedMotion, shakeWrong } from './deck-feedback';
	import DeckFormula from './DeckFormula.svelte';
	import DeckKnob from './DeckKnob.svelte';
	import DeckStage from './DeckStage.svelte';
	import {
		cycle,
		descentOutcome,
		isTap,
		largerGradient,
		parsePlace,
		stepPlace,
		swipeStep,
		type DeckPlace
	} from './deck-state';
	import { formatNumber } from './math';

	/*
	 * /erklaerungen (#60): two 3D slide decks on a full-height canvas. Top: the shared page head
	 * in the colour of the area, with the round deck switch and the text-free step dots. Middle:
	 * one headline, at most one formula on a band from edge to edge, the 3D scene. Bottom: the
	 * shared bar with back, the single control of the slide, and next; it ends before the duck.
	 */
	const decks = explainDecks;
	const lengths = decks.map((entry) => entry.slides.length);
	const NODES: readonly BackpropNode[] = ['a', 'b', 'c', 'mul', 'add', 'loss'];
	/** The second factor of the graph stays put; a and c have a slide of their own. */
	const B = 3;
	type Tone = 'good' | 'bad' | 'plain';
	type RangeControl = Extract<DeckControl, { kind: 'range' }>;

	/** A phone gives the whole bubble slide to the bubbles: the small 3D scene stays away. */
	const phone = new MediaQuery('(max-width: 767.98px)');
	const drawer = topDrawer();
	/** Where each deck was left, for the switch. */
	const left = decks.map(() => 0);

	let place = $state.raw<DeckPlace>({ deck: 0, slide: 0 });
	let knobs = $state({ focusToken: 0, node: 0, temperature: 1, a: 2, c: -1, lr: 0.05 });
	let scaleOn = $state(true);
	let focusTerm = $state<DeckTerm | null>(null);
	let match = $state.raw<MatchState<DeckTerm>>(EMPTY_MATCH);
	let note = $state.raw<{ tone: Tone; text: string } | null>(null);
	let noteElement = $state<HTMLElement>();
	let lead = $state<HTMLElement>();
	let stage = $state<DeckStage>();

	let deck = $derived(decks[place.deck]);
	let slide = $derived(deck.slides[place.slide]);
	let control = $derived(slide.control);
	let onBubbles = $derived(control.kind === 'bubbles');
	let first = $derived(place.deck === 0 && place.slide === 0);
	let last = $derived(place.deck === decks.length - 1 && place.slide === lengths[place.deck] - 1);
	let other = $derived(decks[(place.deck + 1) % decks.length]);
	let showStage = $derived(!(onBubbles && phone.current));
	let solved = $derived(match.matched.length === attentionBubbles.length);

	let attention = $derived<AttentionDeckParams>({
		slide: place.slide,
		focusToken: knobs.focusToken,
		scaleOn,
		temperature: knobs.temperature,
		highlightTerm: onBubbles ? focusTerm : null,
		matchedTerms: onBubbles ? match.matched : []
	});
	let pickedNode = $derived(
		control.kind === 'pick' && control.knob === 'node' ? NODES[knobs.node] : null
	);
	let backprop = $derived<BackpropDeckParams>({
		slide: place.slide,
		a: knobs.a,
		b: B,
		c: knobs.c,
		lr: knobs.lr,
		highlightNode: pickedNode
	});
	let graph = $derived(computeBackpropDeckState(backprop));
	let formulaFocus = $derived(deck.id === 'attention' ? focusTerm : pickedNode);

	// The tutor's screen context follows the slide and the term in focus.
	$effect(() => {
		const source = slide.formula?.source;
		const termId = focusTerm && source ? deckTermIds[focusTerm] : null;
		const screen = {
			route: '/erklaerungen',
			topic: deck.title,
			courseId: deck.courseId,
			tutorialId: deck.tutorialId,
			momentId: slide.id,
			sectionId: slide.id,
			sectionTitle: plainRichText(slide.headline),
			...(termId && source
				? {
						formulaId: source.id,
						formulaLatex: source.latex,
						termId,
						termLabel: attentionTerms[termId].label
					}
				: {})
		};
		untrack(() => screenContext.setScreen(screen));
	});

	// Deep link: `/erklaerungen#attention-5` opens the bubbles.
	$effect(() => {
		const read = () => {
			const next = parsePlace(location.hash, decks);
			if (next) untrack(() => go(next));
		};
		read();
		window.addEventListener('hashchange', read);
		return () => window.removeEventListener('hashchange', read);
	});

	function go(next: DeckPlace, direction = 0) {
		if (next.deck === place.deck && next.slide === place.slide) return;
		place = next;
		left[next.deck] = next.slide;
		note = null;
		focusTerm = null;
		void slideIn(direction);
	}

	const step = (direction: -1 | 1) => go(stepPlace(place, direction, lengths), direction);
	function switchDeck() {
		const deckIndex = (place.deck + 1) % decks.length;
		go({ deck: deckIndex, slide: left[deckIndex] }, 1);
	}

	/** Step to step runs sideways by a short way (DESIGN.md §4.5); the scene eases on its own. */
	async function slideIn(direction: number) {
		if (!direction || reducedMotion()) return;
		await tick();
		if (!lead) return;
		gsap.fromTo(
			lead,
			{ x: direction * 40 },
			{ x: 0, duration: 0.16, ease: 'power3.out', clearProps: 'x' }
		);
	}

	async function say(tone: Tone, text: string, ...elements: (Element | null | undefined)[]) {
		note = { tone, text };
		await tick();
		if (tone === 'good') flashCorrect(noteElement, ...elements);
		else if (tone === 'bad') shakeWrong(noteElement, ...elements);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		if (drawer.open) return;
		const target = event.target;
		// A slider or a text field keeps its own arrow keys.
		if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
		if (target instanceof HTMLElement && target.isContentEditable) return;
		event.preventDefault();
		step(event.key === 'ArrowRight' ? 1 : -1);
	}

	/*
	 * One finger swipes the deck; the mouse turns the figure. The scene would turn on every
	 * sideways drag, so a touch stops here, in the capture phase, before it reaches the canvas.
	 */
	let gesture: { pointer: number; x: number; y: number; time: number; touch: boolean } | null =
		null;

	function sceneDown(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;
		const touch = event.pointerType === 'touch';
		gesture = {
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			time: event.timeStamp,
			touch
		};
		if (touch) event.stopPropagation();
	}

	function sceneMove(event: PointerEvent) {
		if (gesture?.touch && event.pointerId === gesture.pointer) event.stopPropagation();
	}

	function sceneUp(event: PointerEvent) {
		const current = gesture;
		if (!current || event.pointerId !== current.pointer) return;
		gesture = null;
		if (current.touch) event.stopPropagation();
		if (event.type === 'pointercancel') return;
		const dx = event.clientX - current.x;
		const dy = event.clientY - current.y;
		if (isTap(dx, dy, event.timeStamp - current.time)) {
			if (event.target instanceof HTMLCanvasElement) tapFigure();
			return;
		}
		const direction = current.touch ? swipeStep(dx, dy) : 0;
		if (direction) step(direction);
	}

	/** A tap on the figure walks on to the next token or node. */
	function tapFigure() {
		if (control.kind !== 'pick') return;
		knobs[control.knob] = cycle(knobs[control.knob], control.options.length);
	}

	function rangeReadout(range: RangeControl): string {
		return `${range.prefix} ${formatNumber(knobs[range.knob], range.digits)}`;
	}

	/** The valley challenge is judged when the grip is let go. */
	function releaseRange(range: RangeControl, readout: HTMLElement) {
		if (!range.challenge) return;
		const outcome = descentOutcome(graph.descent);
		if (outcome === 'landed') {
			stage?.pulseCorrect('loss');
			void say('good', range.challenge.landed, readout);
		} else {
			stage?.pulseError('loss');
			void say('bad', range.challenge[outcome], readout);
		}
	}

	function choose(
		choice: Extract<DeckControl, { kind: 'choice' }>,
		option: 'a' | 'b',
		chip: EventTarget | null
	) {
		if (!(chip instanceof Element)) return;
		const winner = largerGradient(graph.gradients);
		if (!winner) {
			void say('plain', choice.tie);
			return;
		}
		if (option !== winner) {
			stage?.pulseError(option);
			void say('bad', choice.miss, chip);
			return;
		}
		const loser = winner === 'a' ? 'b' : 'a';
		const size = (node: 'a' | 'b') => formatNumber(Math.abs(graph.gradients[node]), 0);
		stage?.pulseCorrect(winner);
		void say('good', `${size(winner)} gegen ${size(loser)}. ${choice.hit}`, chip);
	}

	function matched(term: DeckTerm, solved: boolean) {
		stage?.pulseCorrect(term);
		if (solved && control.kind === 'bubbles') void say('good', control.solved);
		else note = null;
	}

	function missed(bubble: AttentionBubble) {
		stage?.pulseError(bubble.term);
		void say('bad', bubble.hint);
	}

	function resetBubbles() {
		match = EMPTY_MATCH;
		focusTerm = null;
		note = null;
	}
</script>

<svelte:window {onkeydown} />

<div
	class="deck"
	data-surface="paper"
	data-deck={deck.id}
	data-slide={place.slide}
	data-board={onBubbles ? '' : undefined}
>
	<PageHead accent="explanation" step={place.slide + 1} total={deck.slides.length}>
		{#snippet left()}
			<IconButton
				class="deck-switch"
				label="Deck wechseln: von {deck.label} zu {other.label}"
				onclick={switchDeck}
			>
				<span class="deck-mark" aria-hidden="true">{deck.label.charAt(0)}</span>
			</IconButton>
		{/snippet}
	</PageHead>

	<div
		class="scene"
		onpointerdowncapture={sceneDown}
		onpointermovecapture={sceneMove}
		onpointerupcapture={sceneUp}
		onpointercancelcapture={sceneUp}
	>
		<div class="lead" bind:this={lead}>
			<h1><RichText text={slide.headline} /></h1>
			{#if slide.formula}
				{#key slide.formula.latex}
					<DeckFormula
						latex={slide.formula.latex}
						spoken={slide.formula.spoken}
						active={formulaFocus}
						matched={onBubbles ? match.matched : []}
					/>
				{/key}
			{/if}
		</div>
		<div class="figure">
			{#if showStage}
				<DeckStage
					bind:this={stage}
					deck={deck.id}
					{attention}
					{backprop}
					label="3D-Szene: {plainRichText(slide.headline)}"
				/>
			{/if}
		</div>
	</div>

	<div class="note-slot" role="status">
		{#if note}
			<p class="note" data-tone={note.tone} bind:this={noteElement}>{note.text}</p>
		{/if}
	</div>

	{#if control.kind === 'bubbles'}
		<div class="board">
			<BubbleBoard
				bubbles={attentionBubbles}
				slotOrder={attentionSlotOrder}
				bind:match
				onfocusterm={(term) => (focusTerm = term)}
				onmatch={matched}
				onmiss={missed}
				onidle={() => control.kind === 'bubbles' && void say('plain', control.pickFirst)}
			/>
		</div>
	{/if}

	<BottomBar class="deck-bar" fixed={false}>
		<IconButton icon="arrow-left" label="Zurück" disabled={first} onclick={() => step(-1)} />

		<div class="control" data-instrument>
			{#if control.kind === 'pick'}
				{@const pick = control}
				<DeckKnob
					label={pick.label}
					readout={pick.options[knobs[pick.knob]]}
					min={0}
					max={pick.options.length - 1}
					step={1}
					value={knobs[pick.knob]}
					oninput={(value) => (knobs[pick.knob] = value)}
				/>
			{:else if control.kind === 'range'}
				{@const range = control}
				<DeckKnob
					label={range.label}
					readout={rangeReadout(range)}
					min={range.min}
					max={range.max}
					step={range.step}
					value={knobs[range.knob]}
					oninput={(value) => (knobs[range.knob] = value)}
					onrelease={(readout) => releaseRange(range, readout)}
				/>
			{:else if control.kind === 'switch'}
				<button
					type="button"
					class="switch"
					role="switch"
					aria-checked={scaleOn}
					aria-label="Skalierung mit Wurzel aus d Index k"
					onclick={() => (scaleOn = !scaleOn)}
				>
					<span class="track"><span class="grip" data-grip></span></span>
					<span><RichText text={control.label} /> {scaleOn ? 'an' : 'aus'}</span>
				</button>
			{:else if control.kind === 'choice'}
				{@const choice = control}
				<div class="choice" role="group" aria-label={choice.label}>
					{#each choice.options as option (option)}
						<IconButton
							label="Zweig {option}"
							onclick={(event) => choose(choice, option, event.currentTarget)}
						>
							{option}
						</IconButton>
					{/each}
				</div>
			{:else if solved}
				<!-- The green bubbles in their sockets are the count; only the way back needs a key. -->
				<IconButton icon="undo" label="Wiederholen" onclick={resetBubbles} />
			{/if}
		</div>

		<IconButton icon="arrow-right" label="Weiter" disabled={last} onclick={() => step(1)} />
	</BottomBar>
</div>

<style>
	.deck {
		--dot-gap: var(--space-s);

		display: grid;
		grid-template:
			'top' auto
			'lead' auto
			'figure' minmax(0, 1fr)
			'board' auto
			'bar' auto / minmax(0, 1fr);
		block-size: 100%;
	}

	/* The shared page head and bottom bar render their own root; here they only get their row. */
	.deck > :global(header) {
		grid-area: top;
	}

	.deck > :global(.deck-bar) {
		grid-area: bar;
		/* One line of 64px, also above the home indicator of a phone. */
		block-size: calc(var(--bottom-bar-height) + env(safe-area-inset-bottom));
	}

	/* The deck's initial in the round key: A or B. The accessible name says where it leads. */
	.deck-mark {
		font-weight: var(--font-weight-strong);
		line-height: 1;
	}

	/*
	 * Headline, band and figure share one swipe area. It has no box of its own, so both parts
	 * are rows of the deck and the formula band runs across every column.
	 */
	.scene {
		display: contents;
	}

	.lead {
		grid-area: lead;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-s);
		padding-block-start: var(--space-s);
		touch-action: pan-y;
	}

	h1 {
		margin: 0;
		padding-inline: var(--gutter);
		font-size: var(--type-question);
		font-weight: var(--font-weight-strong);
		line-height: var(--line-question);
		letter-spacing: var(--letter-question);
		text-wrap: balance;
	}

	.lead > h1:last-child {
		padding-block-end: var(--space-s);
	}

	.figure {
		grid-area: figure;
		position: relative;
		min-block-size: 0;
		touch-action: pan-y;
	}

	/* The note lies on the top edge of the figure and lets every touch through. */
	.note-slot {
		grid-area: figure;
		z-index: 2;
		align-self: start;
		display: grid;
		justify-items: center;
		padding: var(--space-s) var(--gutter) 0;
		pointer-events: none;
	}

	.note {
		margin: 0;
		padding: var(--space-s) var(--space-m);
		border-radius: var(--radius-option);
		background: var(--popup-bg);
		color: var(--popup-text);
		backdrop-filter: blur(14px);
		text-wrap: balance;
	}

	.note[data-tone='good'] {
		background: var(--status-good);
		color: var(--status-good-text);
	}

	.note[data-tone='bad'] {
		background: var(--status-bad);
		color: var(--status-bad-text);
	}

	.control {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: var(--space-s);
		min-inline-size: 0;
		max-inline-size: 26rem;
		margin-inline: auto;
	}

	.control > :global(.knob) {
		flex: 1;
	}

	.switch {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--space-s);
		min-block-size: var(--hit);
		padding-inline: var(--space-s) var(--space-m);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--palette-white);
		color: var(--palette-ink);
		font: inherit;
		white-space: nowrap;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.switch:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	.track {
		display: block;
		inline-size: calc(var(--grip-size) + var(--space-m));
		block-size: var(--grip-size);
		border-radius: var(--radius-pill);
		background: var(--well);
	}

	.grip {
		display: block;
		box-sizing: border-box;
		inline-size: var(--grip-size);
		block-size: var(--grip-size);
		border: var(--hairline-width) solid var(--grip-border);
		border-radius: 50%;
		background: var(--palette-white);
		transition: translate var(--change-time) var(--change-easing);
	}

	.switch[aria-checked='true'] .grip {
		background: var(--grip);
		translate: var(--space-m) 0;
	}

	.choice {
		display: flex;
		gap: var(--space-s);
	}

	/*
	 * The bubble slide. The bubbles get every pixel between band and bar; their size follows the
	 * height of this box (BubbleBoard reads it as a container). The last slot ends above the
	 * duck, which stands taller than the bar.
	 */
	.deck[data-board] {
		grid-template:
			'top' auto
			'lead' auto
			'note' auto
			'board' minmax(0, 1fr)
			'bar' auto / minmax(0, 1fr);
	}

	.board {
		grid-area: board;
		display: grid;
		align-content: center;
		justify-items: center;
		min-block-size: 0;
		padding: var(--space-s) var(--gutter) var(--space-l);
		container-type: size;
	}

	/* On a phone the feedback has its own row below the formula. */
	.deck[data-board] .figure {
		display: none;
	}

	.deck[data-board] .note-slot {
		grid-area: note;
	}

	.deck[data-board] .note-slot:empty {
		padding: 0;
	}

	.deck[data-board] .note {
		font-size: var(--type-meta);
		line-height: var(--line-meta);
	}

	/* From tablet width the scene stands beside the bubbles, below the band from edge to edge. */
	@media (min-width: 48rem) {
		.deck[data-board] {
			grid-template:
				'top top' auto
				'lead lead' auto
				'figure board' minmax(0, 1fr)
				'bar bar' auto / minmax(0, 1fr) minmax(20rem, 28rem);
		}

		.deck[data-board] .figure {
			display: block;
		}

		.deck[data-board] .note-slot {
			grid-area: figure;
		}

		.deck[data-board] .note {
			font-size: inherit;
			line-height: inherit;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.grip {
			transition: none;
		}
	}
</style>
