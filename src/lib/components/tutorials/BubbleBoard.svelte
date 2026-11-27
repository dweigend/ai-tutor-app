<script lang="ts">
	import { gsap } from 'gsap';
	import { tick } from 'svelte';
	import type { AttentionBubble, DeckTerm } from '$lib/math/attention-terms';
	import { RichText } from '$lib/modules';
	import { judgeDrop, slotAt, type MatchState, type SlotBox } from './bubble-match';
	import { flashCorrect, reducedMotion, shakeWrong } from './deck-feedback';

	/*
	 * Variable bubbles (#60, David's sketch): round bubbles on the left, their meanings on the
	 * right. A bubble is dragged into the socket of a slot, or selected and then placed with a
	 * tap or the keyboard. All three ways end in `place`, so they are judged alike. Every bubble
	 * is a circle of one size; the size follows the height of the surrounding size container.
	 */
	let {
		bubbles,
		slotOrder,
		match = $bindable(),
		onfocusterm,
		onmatch,
		onmiss,
		onidle
	}: {
		bubbles: readonly AttentionBubble[];
		/** Order of the meanings on the right. */
		slotOrder: readonly DeckTerm[];
		match: MatchState<DeckTerm>;
		/** The term the reader holds, hovers or has selected; null when none. */
		onfocusterm?: (term: DeckTerm | null) => void;
		onmatch?: (term: DeckTerm, solved: boolean) => void;
		onmiss?: (bubble: AttentionBubble, slot: DeckTerm) => void;
		/** A slot was tapped while no bubble was selected. */
		onidle?: () => void;
	} = $props();

	const DRAG_START = 6;
	const REJECT_MS = 1400;
	/** A click right after a drag belongs to that drag, not to a selection. */
	const CLICK_GUARD_MS = 350;

	let slots = $derived(
		slotOrder.flatMap((term) => bubbles.filter((bubble) => bubble.term === term))
	);
	let selected = $state<DeckTerm | null>(null);
	let dragging = $state<DeckTerm | null>(null);
	let over = $state<DeckTerm | null>(null);
	let rejected = $state<DeckTerm | null>(null);
	let rejectTimer: ReturnType<typeof setTimeout> | undefined;
	let dragEnd = -Infinity;

	type Elements<E extends HTMLElement> = Partial<Record<DeckTerm, E>>;
	const homes: Elements<HTMLButtonElement> = {};
	const slotElements: Elements<HTMLButtonElement> = {};
	const docked: Elements<HTMLElement> = {};

	/** Keeps the element of a term at hand for measuring and animating. */
	function keep<E extends HTMLElement>(store: Elements<E>, term: DeckTerm) {
		return (element: E) => {
			store[term] = element;
			return () => {
				gsap.killTweensOf(element);
				if (store[term] === element) delete store[term];
			};
		};
	}

	let drag: {
		term: DeckTerm;
		pointer: number;
		x: number;
		y: number;
		moved: boolean;
		element: HTMLButtonElement;
		boxes: SlotBox<DeckTerm>[];
	} | null = null;

	const flashes = new Set<gsap.Context>();
	$effect(() => () => {
		clearTimeout(rejectTimer);
		for (const flash of flashes) flash.kill();
		flashes.clear();
		drag = null;
	});
	function flash(landed?: HTMLElement, slot?: HTMLElement) {
		if (landed && slot) flashes.add(gsap.context(() => flashCorrect(landed, slot)));
	}

	const isMatched = (term: DeckTerm) => match.matched.includes(term);

	function openBoxes(): SlotBox<DeckTerm>[] {
		return slots
			.filter((slot) => !isMatched(slot.term) && slotElements[slot.term])
			.map((slot) => {
				const { left, top, right, bottom } = slotElements[slot.term]!.getBoundingClientRect();
				return { id: slot.term, left, top, right, bottom };
			});
	}

	function down(event: PointerEvent, term: DeckTerm) {
		if (event.button !== 0 || drag) return;
		const element = event.currentTarget as HTMLButtonElement;
		element.setPointerCapture(event.pointerId);
		drag = {
			term,
			pointer: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			moved: false,
			element,
			boxes: []
		};
	}

	function move(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (!drag.moved) {
			if (Math.hypot(dx, dy) < DRAG_START) return;
			drag.moved = true;
			drag.boxes = openBoxes();
			dragging = drag.term;
			selected = null;
			onfocusterm?.(drag.term);
			gsap.killTweensOf(drag.element);
			// Lifted: a slight tilt and the ink edge (DESIGN.md §3.4).
			if (!reducedMotion()) {
				gsap.to(drag.element, { scale: 1.08, rotation: -2, duration: 0.16, ease: 'power2.out' });
			}
		}
		gsap.set(drag.element, { x: dx, y: dy });
		over = slotAt(event.clientX, event.clientY, drag.boxes);
	}

	function up(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointer) return;
		const { term, element, moved } = drag;
		drag = null;
		if (!moved) return; // a tap: the click selects
		dragEnd = performance.now();
		const slot = event.type === 'pointerup' ? over : null;
		dragging = null;
		over = null;
		if (slot) void place(term, slot, true);
		else {
			springHome(element);
			onfocusterm?.(null);
		}
	}

	/** Missed throw: the bubble springs back to its place (one elastic swing, §4.4). */
	function springHome(element: HTMLElement) {
		gsap.killTweensOf(element);
		if (reducedMotion()) {
			gsap.set(element, { clearProps: 'transform' });
			return;
		}
		gsap.to(element, {
			x: 0,
			y: 0,
			scale: 1,
			rotation: 0,
			duration: 0.6,
			ease: 'elastic.out(1, 0.55)',
			clearProps: 'transform'
		});
	}

	async function place(term: DeckTerm, slot: DeckTerm, thrown = false) {
		const bubble = bubbles.find((entry) => entry.term === term);
		const home = homes[term];
		const result = judgeDrop(match, term, slot, bubbles.length);
		if (!bubble || result.outcome === 'ignored') {
			if (home) springHome(home);
			return;
		}
		if (result.outcome === 'missed') {
			match = result.state;
			// The bubble stays selected: its term keeps glowing in the formula for the next try.
			selected = term;
			onfocusterm?.(term);
			rejected = slot;
			clearTimeout(rejectTimer);
			rejectTimer = setTimeout(() => (rejected = null), REJECT_MS);
			if (home && thrown) springHome(home);
			shakeWrong(slotElements[slot], thrown ? null : home);
			onmiss?.(bubble, slot);
			return;
		}
		// Matched: the bubble moves into the socket, flying from where it was let go.
		const from = home?.getBoundingClientRect();
		if (home) gsap.killTweensOf(home);
		match = result.state;
		selected = null;
		onfocusterm?.(null);
		onmatch?.(term, result.solved);
		await tick();
		const landed = docked[term];
		const slotElement = slotElements[slot];
		if (!landed || !from || reducedMotion()) {
			flash(landed, slotElement);
			return;
		}
		const to = landed.getBoundingClientRect();
		gsap.fromTo(
			landed,
			{ x: from.left - to.left, y: from.top - to.top, scale: 1.08 },
			{
				x: 0,
				y: 0,
				scale: 1,
				duration: 0.3,
				ease: 'back.out(1.6)',
				clearProps: 'transform',
				onComplete: () => flash(landed, slotElement)
			}
		);
	}

	function pick(term: DeckTerm) {
		if (performance.now() - dragEnd < CLICK_GUARD_MS) return;
		selected = selected === term ? null : term;
		onfocusterm?.(selected);
	}

	function tapSlot(slot: DeckTerm) {
		if (isMatched(slot)) return;
		if (selected) void place(selected, slot);
		else onidle?.();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !selected) return;
		event.preventDefault();
		selected = null;
		onfocusterm?.(null);
	}

	function hover(event: PointerEvent, term: DeckTerm | null) {
		if (event.pointerType !== 'mouse' || dragging) return;
		onfocusterm?.(term ?? selected);
	}

	function slotState(term: DeckTerm): 'matched' | 'rejected' | 'over' | 'ready' | undefined {
		if (isMatched(term)) return 'matched';
		if (rejected === term) return 'rejected';
		if (over === term) return 'over';
		return selected ? 'ready' : undefined;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (Escape lets go of the selected bubble) -->
<div class="board" style:--count={bubbles.length} {onkeydown}>
	<ul class="column" aria-label="Variablen">
		{#each bubbles as bubble (bubble.term)}
			<li class="home" class:empty={isMatched(bubble.term)}>
				{#if !isMatched(bubble.term)}
					<button
						type="button"
						class="bubble"
						class:lifted={dragging === bubble.term}
						data-bubble={bubble.term}
						aria-label={bubble.spoken}
						aria-pressed={selected === bubble.term}
						{@attach keep(homes, bubble.term)}
						onpointerdown={(event) => down(event, bubble.term)}
						onpointermove={move}
						onpointerup={up}
						onpointercancel={up}
						onlostpointercapture={up}
						onpointerenter={(event) => hover(event, bubble.term)}
						onpointerleave={(event) => hover(event, null)}
						onclick={() => pick(bubble.term)}
					>
						<span><RichText text={bubble.label} /></span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>
	<ul class="column" aria-label="Bedeutungen">
		{#each slots as slot (slot.term)}
			<li>
				<button
					type="button"
					class="slot"
					data-slot={slot.term}
					data-state={slotState(slot.term)}
					aria-disabled={isMatched(slot.term)}
					aria-label={isMatched(slot.term)
						? `${slot.meaning}: ${slot.spoken}, zugeordnet`
						: `Bedeutung: ${slot.meaning}`}
					{@attach keep(slotElements, slot.term)}
					onclick={() => tapSlot(slot.term)}
				>
					<span class="socket">
						{#if isMatched(slot.term)}
							<span class="bubble docked" {@attach keep(docked, slot.term)}>
								<span><RichText text={slot.label} /></span>
							</span>
						{/if}
					</span>
					<span class="meaning">{slot.meaning}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	.board {
		/* As large as the height allows: never below the 44px target, never above 72px. */
		--bubble: clamp(
			var(--hit),
			calc((100cqb - (var(--count) - 1) * var(--space-s)) / var(--count)),
			4.5rem
		);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-rows: repeat(var(--count), auto);
		gap: var(--space-s) var(--space-m);
		inline-size: 100%;
		max-inline-size: 30rem;
	}

	.column {
		display: grid;
		grid-row: 1 / -1;
		grid-template-rows: subgrid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		align-items: center;
		min-block-size: var(--bubble);
	}

	/* An emptied place keeps an open ring, like an open step dot. */
	.home {
		position: relative;
		justify-items: start;
		inline-size: var(--bubble);
	}

	.home.empty::before {
		content: '';
		inline-size: var(--bubble);
		block-size: var(--bubble);
		border: var(--hairline-width) solid var(--text-muted);
		border-radius: 50%;
		box-sizing: border-box;
	}

	/* RichText sets Greek signs such as σ in the code voice (DESIGN.md §6.7). */
	.bubble {
		display: inline-grid;
		place-items: center;
		box-sizing: border-box;
		inline-size: var(--bubble);
		block-size: var(--bubble);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--type-explanation);
		color: var(--type-explanation-text);
		font: inherit;
		font-size: clamp(var(--type-body), calc(var(--bubble) * 0.36), 1.625rem);
		line-height: 1;
		white-space: nowrap;
	}

	button.bubble {
		position: relative;
		z-index: 1;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	button.bubble:focus-visible,
	.slot:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	/*
	 * Picked up for tap or keyboard: inverted, with a ring. It keeps its place, so after a missed
	 * throw no bubble rests on the edge of a slot.
	 */
	button.bubble[aria-pressed='true'] {
		background: var(--action);
		color: var(--action-text);
		outline: var(--edge-width) solid var(--action);
		outline-offset: var(--edge-width);
	}

	button.bubble[aria-pressed='true']:focus-visible {
		outline-color: var(--focus);
	}

	button.bubble.lifted {
		z-index: 3;
		outline: var(--edge-width) solid var(--hairline);
		cursor: grabbing;
	}

	.docked {
		position: relative;
		z-index: 2;
		background: var(--status-good);
		color: var(--status-good-text);
	}

	.slot {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: var(--space-s);
		inline-size: 100%;
		min-block-size: var(--bubble);
		padding: 0 var(--space-m) 0 0;
		border: 0;
		/* A pill: its left cap follows the round socket. */
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--text);
		font: inherit;
		text-align: start;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	.slot[aria-disabled='true'] {
		cursor: default;
	}

	/* The socket is a well the bubble drops into. */
	.socket {
		display: grid;
		box-sizing: border-box;
		inline-size: var(--bubble);
		block-size: var(--bubble);
		border-radius: 50%;
		background: var(--well);
	}

	/* The hairline is drawn inside the pill, so a slot is exactly as high as its bubble. */
	.slot[data-state='ready'],
	.slot[data-state='over'] {
		box-shadow: inset 0 0 0 var(--hairline-width) var(--hairline);
	}

	.slot[data-state='over'] {
		background: var(--mark);
		color: var(--mark-text);
	}

	.slot[data-state='over'] .socket {
		background: var(--card);
	}

	/* Does not fit yet: the deviation plate, with the hint in the note above. */
	.slot[data-state='rejected'] {
		background: var(--status-bad);
		color: var(--status-bad-text);
	}

	.meaning {
		text-wrap: balance;
	}

	/* A low box has small bubbles: the meaning steps down with them. */
	@container (max-height: 20rem) {
		.meaning {
			font-size: var(--type-meta);
			line-height: var(--line-meta);
		}
	}
</style>
