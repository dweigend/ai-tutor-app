<script lang="ts">
	import { flushSync } from 'svelte';
	import { resolve } from '$app/paths';
	import Tile from '$lib/components/Tile.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import DuckStage from '$lib/components/duck/DuckStage.svelte';
	import { prefersReducedMotion, type Animation } from '$lib/modules';
	import type { HomeSignal } from '$lib/memory';
	import { homeLinkLabel, homeOffers, homeTutor, type HomeLink } from '$lib/navigation';
	import TodayTile from './TodayTile.svelte';
	import {
		availableArrangement,
		initialArrangement,
		moveOffer,
		offerColumns,
		parseArrangement,
		swipeAway,
		type Arrangement,
		type SwipeOutcome
	} from './arrangement';
	import { blockOffset, MAX_TILT_DEG, wushAction } from './block-physics';
	import { animatePose, REST, type Pose } from './pose';
	import { tileGesture, type Point } from './tile-gesture';

	interface Props {
		todayDone: number;
		todayPlanned: number;
		doneTasks?: readonly string[];
		onHomeSignal?: (id: string, signal: HomeSignal) => (() => void) | void;
	}

	let { todayDone, todayPlanned, doneTasks = [], onHomeSignal }: Props = $props();

	const STORAGE_KEY = 'tutor.home-arrangement.v1';
	const SLOT_COUNT = 6;
	const POOL = homeOffers.map(({ id }) => id);
	const OFFERS = new Map(homeOffers.map((offer) => [offer.id, offer]));
	const WORD: Record<SwipeOutcome, string> = { later: 'Später', dismiss: 'Weg' };
	const SHORTCUTS = 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown';
	const WIDE_SIZES = '(min-width: 900px) 50vw, 100vw';
	const SMALL_SIZES = '(min-width: 900px) 25vw, 50vw';
	const TILT_SPEED = 300;

	let grid: HTMLElement;
	let tileGrid: TileGrid;
	let slots: Record<string, HTMLDivElement> = {};
	const running = new Map<string, Animation>();
	let arrangement = $state.raw(initialArrangement(POOL, SLOT_COUNT));
	let excluded = $derived(
		new Set(
			homeOffers.filter(({ taskId }) => taskId && doneTasks.includes(taskId)).map(({ id }) => id)
		)
	);
	let available = $derived(availableArrangement(arrangement, excluded));
	let cells = $derived([
		...available.slots.slice(0, 1),
		'today',
		'tutor',
		...available.slots.slice(1)
	]);
	let poses = $state<Record<string, Pose>>({});
	let grabbed = $state<string>();
	let leaving = $state<string>();
	let announcement = $state('');
	let undo = $state.raw<{
		before: Arrangement;
		removed: string;
		arriving: string;
		action: SwipeOutcome;
		restoreSignal?: () => void;
	}>();
	let undoButton = $state<HTMLButtonElement>();

	interface Drag {
		id: string;
		start: Point;
		base: Pose;
		bounds: { left: number; right: number };
		fixed: boolean;
		reduced: boolean;
	}
	let drag: Drag | undefined;

	function hrefFor(link: HomeLink): string {
		if (link.slug) return resolve('/magazin/[slug]', { slug: link.slug });
		const query = link.taskId ? `?task=${encodeURIComponent(link.taskId)}` : '';
		return `${resolve(link.path)}${query}`;
	}

	function save(next: Arrangement) {
		arrangement = next;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// When storage is blocked, the arrangement still lasts for this visit.
		}
	}

	function load(): Arrangement {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			return parseArrangement(stored ? JSON.parse(stored) : null, POOL, SLOT_COUNT);
		} catch {
			return initialArrangement(POOL, SLOT_COUNT);
		}
	}

	function stop(id: string) {
		running.get(id)?.stop();
		running.delete(id);
	}

	function spring(id: string, from: Pose, to = REST, velocity?: Point, onRest?: () => void) {
		stop(id);
		let finished = false;
		const animation = animatePose({
			from,
			to,
			velocity,
			preset: velocity ? 'carry' : 'snap',
			onUpdate: (pose) => (poses[id] = pose),
			onRest: () => {
				finished = true;
				running.delete(id);
				delete poses[id];
				onRest?.();
			}
		});
		if (!finished) running.set(id, animation);
	}

	function slotFrames(): Map<string, Point> {
		const frames = new Map<string, Point>();
		for (const id of cells) {
			const box = slots[id]?.getBoundingClientRect();
			if (box) frames.set(id, { x: box.left, y: box.top });
		}
		return frames;
	}

	/** Capture the drawn positions before a confirmed change, then spring to the new slots. */
	function changeLayout(
		next: Arrangement,
		incoming?: { id: string; pose: Pose },
		released?: {
			id: string;
			velocity: Point;
		}
	) {
		const before = slotFrames();
		for (const id of running.keys()) stop(id);
		flushSync(() => save(next));
		const after = slotFrames();
		for (const [id, frame] of after) {
			const previous = before.get(id);
			const pose = poses[id] ?? REST;
			const from = previous
				? {
						x: previous.x + pose.x - frame.x,
						y: previous.y + pose.y - frame.y,
						rotate: pose.rotate
					}
				: incoming?.id === id
					? incoming.pose
					: REST;
			spring(id, from, REST, released?.id === id ? released.velocity : undefined);
		}
		for (const id of before.keys()) {
			if (!after.has(id)) delete poses[id];
		}
	}

	function reorder(id: string, target: string, velocity?: Point) {
		const from = available.slots.indexOf(id);
		const to = available.slots.indexOf(target);
		if (from === to || from < 0 || to < 0) return;
		undo = undefined;
		const next = moveOffer(available, from, to);
		changeLayout(retainExcluded(next), undefined, velocity && { id, velocity });
		const offer = OFFERS.get(id);
		if (offer)
			announcement = `Platz ${to + 1} von ${available.slots.length}: ${homeLinkLabel(offer)}`;
	}

	function retainExcluded(current: Arrangement): Arrangement {
		// Keep the v1 storage schema and every offer ID even when completed tasks are hidden.
		return { ...current, away: [...current.away, ...excluded] };
	}

	function beginDrag(id: string, start: Point) {
		stop(id);
		const { left, right } = grid.getBoundingClientRect();
		drag = {
			id,
			start,
			base: poses[id] ?? REST,
			bounds: { left, right },
			fixed: !OFFERS.has(id),
			reduced: prefersReducedMotion()
		};
		grabbed = id;
	}

	function moveDrag(id: string, pointer: Point, velocity: Point) {
		if (drag?.id !== id) return;
		const offset = blockOffset(drag.start, pointer, drag.bounds, drag.fixed);
		const tilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, velocity.x / TILT_SPEED));
		poses[id] = {
			x: drag.base.x + offset.x,
			y: drag.base.y + offset.y,
			rotate: drag.reduced ? 0 : tilt
		};
	}

	function finishDrag() {
		drag = undefined;
		grabbed = undefined;
	}

	function cancelDrag(id: string) {
		finishDrag();
		spring(id, poses[id] ?? REST, REST, { x: 0, y: 0 });
	}

	function drop(id: string, pointer: Point, velocity: Point) {
		const active = drag;
		if (active?.id !== id) return;
		moveDrag(id, pointer, velocity);
		finishDrag();
		const action = wushAction(active.start, pointer, velocity, active.bounds, active.fixed);
		if (action && available.waiting.length > 0) {
			throwOffer(id, action, velocity);
			return;
		}
		const target = active.fixed
			? undefined
			: available.slots.find((candidate) => {
					const box = slots[candidate]?.getBoundingClientRect();
					return (
						box &&
						pointer.x >= box.left &&
						pointer.x < box.right &&
						pointer.y >= box.top &&
						pointer.y < box.bottom
					);
				});
		if (target && target !== id) reorder(id, target, velocity);
		else spring(id, poses[id] ?? REST, REST, velocity);
	}

	function throwOffer(id: string, action: SwipeOutcome, velocity?: Point) {
		const slot = available.slots.indexOf(id);
		const next = swipeAway(available, slot, action);
		if (leaving || next === available) return;
		const box = slots[id].getBoundingClientRect();
		const edge = grid.getBoundingClientRect();
		const pose = poses[id] ?? REST;
		const x = action === 'later' ? edge.right - box.left : edge.left - box.right;
		leaving = id;
		spring(id, pose, { ...pose, x, rotate: 0 }, velocity, () => {
			leaving = undefined;
			commitThrow(id, action, !velocity);
		});
	}

	function commitThrow(id: string, action: SwipeOutcome, fromKeys: boolean) {
		const slot = available.slots.indexOf(id);
		const next = swipeAway(available, slot, action);
		const removed = OFFERS.get(id);
		const arriving = OFFERS.get(next.slots[slot]);
		if (next === available || !removed || !arriving) return;
		const before = arrangement;
		const height = slots[id].offsetHeight;
		const restoreSignal = onHomeSignal?.(id, action === 'later' ? 'keep' : 'dismiss');
		undo = {
			before,
			action,
			removed: id,
			arriving: arriving.id,
			restoreSignal: restoreSignal || undefined
		};
		changeLayout(retainExcluded(next), { id: arriving.id, pose: { ...REST, y: -height } });
		announcement = `${WORD[action]}. Neu: ${homeLinkLabel(arriving)}`;
		if (fromKeys) undoButton?.focus();
	}

	function undoLast() {
		if (!undo || grabbed || leaving) return;
		const { before, removed, arriving, action, restoreSignal } = undo;
		const width = slots[arriving]?.offsetWidth ?? 0;
		undo = undefined;
		restoreSignal?.();
		changeLayout(before, {
			id: removed,
			pose: { ...REST, x: action === 'later' ? width : -width }
		});
		slots[removed]?.querySelector('a')?.focus();
		const offer = OFFERS.get(removed);
		if (offer) announcement = `Zurück: ${homeLinkLabel(offer)}`;
	}

	function keyMove(event: KeyboardEvent, id: string) {
		const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
		if (!event.altKey || step === undefined || grabbed || leaving) return;
		event.preventDefault();
		const target = available.slots[available.slots.indexOf(id) + step];
		if (!target) {
			announcement = 'Rand des Rasters';
			return;
		}
		reorder(id, target);
		slots[id]?.querySelector('a')?.focus();
	}

	const gesture = tileGesture({
		targetFor(event) {
			if (leaving || !(event.target instanceof Element)) return;
			const anchor = event.target.closest<HTMLElement>('a.tile-link');
			const id = anchor?.closest<HTMLElement>('[data-home-tile]')?.dataset.homeTile;
			if (anchor && id) return { id, anchor };
		},
		onInput: () => tileGrid?.finishEntrance(),
		onGrab: beginDrag,
		onMove: moveDrag,
		onDrop: drop,
		onCancel: cancelDrag
	});

	$effect(() => {
		arrangement = load();
		return () => {
			for (const id of running.keys()) stop(id);
		};
	});
</script>

<p id="home-hint" class="visually-hidden">
	Alt und Pfeiltasten verschieben ein Angebot. Später und Weg tauschen es gegen ein neues.
</p>
<p class="visually-hidden" aria-live="polite">{announcement}</p>

<nav aria-label="Bereiche" data-home-grid bind:this={grid} {@attach gesture}>
	<TileGrid bind:this={tileGrid} fill stack>
		{#each cells as id (id)}
			{@const offer = OFFERS.get(id)}
			{@const high = offer?.importance === 'high'}
			{@const pose = poses[id]}
			<div
				bind:this={slots[id]}
				class="slot"
				class:moving={!!pose}
				style:--columns={offerColumns(offer?.importance ?? 'normal')}
				data-home-tile={id}
				data-stack-block
				data-lifted={grabbed === id || leaving === id ? '' : undefined}
			>
				<div
					class="block"
					style:translate={pose ? `${pose.x}px ${pose.y}px` : undefined}
					style:rotate={pose?.rotate ? `${pose.rotate}deg` : undefined}
				>
					{#if id === 'today'}
						<TodayTile done={todayDone} planned={todayPlanned} href={resolve('/aktivitaet')} />
					{:else if id === 'tutor'}
						{#snippet duck()}
							<DuckStage
								variant="tile"
								idle
								cycle
								interactive={false}
								active={grabbed === undefined}
							/>
						{/snippet}
						<Tile
							editorial={homeTutor}
							tone={homeTutor.tone}
							media={duck}
							href={hrefFor(homeTutor)}
						/>
					{:else if offer}
						<Tile
							tone={offer.tone}
							art={offer.art}
							editorial={{
								category: offer.category,
								title: offer.title,
								subtitle: high ? offer.subtitle : undefined,
								subtitleId: high ? `subtitle-${id}` : undefined,
								icon: high ? offer.icon : undefined
							}}
							sizes={high ? WIDE_SIZES : SMALL_SIZES}
							priority={id === available.slots[0]}
							href={hrefFor(offer)}
							ariaLabel={homeLinkLabel(offer)}
							ariaDescribedby={high ? `home-hint subtitle-${id}` : 'home-hint'}
							ariaKeyshortcuts={SHORTCUTS}
							onkeydown={(event) => keyMove(event, id)}
							onclick={() => onHomeSignal?.(id, 'open')}
						/>
						<div class="offer-keys" role="group" aria-label="Aktionen für {offer.title}">
							{#each ['later', 'dismiss'] as const as action}
								<button
									type="button"
									class="m-hit m-key m-keyword"
									aria-label="{WORD[action]}: {offer.title}"
									disabled={available.waiting.length === 0}
									onclick={() => {
										if (!grabbed) throwOffer(id, action);
									}}
								>
									{WORD[action]}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				{#if undo?.arriving === id}
					<div class="undo" data-surface={undo.action === 'dismiss' ? 'crimson' : 'yellow'}>
						<span>{WORD[undo.action]}</span>
						<button
							bind:this={undoButton}
							type="button"
							class="m-hit m-key m-keyword"
							onclick={undoLast}
						>
							Rückgängig
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</TileGrid>
</nav>

<style>
	nav {
		background: var(--palette-paper);
	}

	nav :global(.tile-grid) {
		grid-auto-rows: minmax(10rem, 1fr);
	}

	.slot {
		position: relative;
		display: grid;
		grid-column: span var(--columns);
		min-inline-size: 0;
		min-block-size: 0;
		background: var(--palette-paper);
		touch-action: pan-y;
	}

	[data-home-tile='today'] {
		grid-area: 2 / 1;
	}

	[data-home-tile='tutor'] {
		grid-area: 2 / 2;
	}

	.block {
		position: relative;
		display: grid;
		min-inline-size: 0;
		min-block-size: 0;
	}

	.moving {
		z-index: 1;
	}

	.slot[data-lifted] {
		z-index: 3;
	}

	.slot[data-lifted] :global(a) {
		cursor: grabbing;
	}

	.slot[data-lifted] .block::after {
		position: absolute;
		inset: 0;
		border: var(--edge-width) solid var(--palette-ink);
		content: '';
		pointer-events: none;
	}

	.offer-keys {
		position: absolute;
		inset-block-start: 0;
		inset-inline-end: 0;
		display: flex;
		gap: var(--hairline-width);
		background: var(--hairline);
	}

	.block:not(:has(:focus-visible)) .offer-keys,
	.slot[data-lifted] .offer-keys {
		clip-path: inset(50%);
		pointer-events: none;
	}

	button {
		padding-inline: var(--step-3);
	}

	.undo {
		position: absolute;
		inset: 0 0 auto;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-inline-start: var(--step-2);
		background: var(--surface);
		color: var(--text);
		font: 600 var(--type-label) var(--font-ui);
	}

	@media (min-width: 900px) {
		[data-home-tile='today'] {
			grid-area: 1 / 3;
		}

		[data-home-tile='tutor'] {
			grid-area: 1 / 4;
		}

		nav :global(.tile-grid) {
			grid-auto-rows: minmax(13rem, 1fr);
		}
	}
</style>
