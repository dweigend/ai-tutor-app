<script module lang="ts">
	// The first mount of a page load is its hydration: the tiles are already painted then.
	let hydrated = false;
</script>

<script lang="ts">
	import type { ApiMode } from '$lib/api/types';
	import { flushSync, tick, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import type { MotifId } from '$lib/art';
	import Tile from '$lib/components/Tile.svelte';
	import TileGrid from '$lib/components/TileGrid.svelte';
	import type { HomeSignal } from '$lib/memory';
	import { Icon, prefersReducedMotion, type Animation } from '$lib/modules';
	import { homeTiles, type TileGraphicId, type TileType } from '$lib/navigation';
	import TodayTile from './TodayTile.svelte';
	import { bento, gridArea, MAX_TILES } from './bento';
	import { blockOffset, IMPACT_PX, MAX_TILT_DEG, wushAction } from './block-physics';
	import {
		homeTopics,
		initialBoard,
		moveTile,
		parseBoard,
		sendBack,
		syncBoard,
		type Board,
		type SwipeOutcome
	} from './board';
	import {
		LEARNING_QUEUE_EVENT,
		LEARNING_QUEUE_KEY,
		parseLearningQueue,
		parseLearningQueueText,
		readLearningQueueText,
		removeFromLearningQueue,
		restoreToLearningQueue,
		shortTitle,
		type QueueItem,
		type QueueType,
		type RemovedEntry
	} from '$lib/learning-queue';
	import { animateFall, animatePose, REST, type Pose } from './pose';
	import { tileGesture, type Point } from './tile-gesture';

	interface Props {
		mode: ApiMode;
		todayDone: number;
		todayPlanned: number;
		onHomeSignal?: (id: string, signal: HomeSignal) => (() => void) | void;
	}

	let { mode, todayDone, todayPlanned, onHomeSignal }: Props = $props();

	const BOARD_KEY = 'tutor.home-board.v1';
	const DAY = 'today';
	/** Topic ids come from the queue; the prefix keeps them apart from the areas. */
	const TOPIC = 'topic:';
	const CORE = homeTiles.map(({ id }) => id);
	const CORE_TILES = new Map(homeTiles.map((tile) => [tile.id, tile]));
	const TOPIC_SLOTS = MAX_TILES - 1 - CORE.length;
	const TOPIC_GRAPHICS: Record<QueueType, TileGraphicId> = {
		exercise: 'fader',
		explanation: 'valley',
		magazine: 'pages',
		whiteboard: 'board',
		activity: 'pulse'
	};
	const TYPE_WORDS: Record<QueueType, string> = {
		exercise: 'Übung',
		explanation: 'Erklärung',
		magazine: 'Magazin',
		whiteboard: 'Whiteboard',
		activity: 'Aktivität'
	};
	const SHORTCUTS = 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown';
	const SIZES = '(orientation: landscape) 45vw, 100vw';
	const TILT_SPEED = 300;
	const STAGGER_SECONDS = 0.06;
	/** Hydration this long after the first paint must not make visible tiles vanish and drop. */
	const LATE_HYDRATION_MS = 1500;
	const STILL: Point = { x: 0, y: 0 };

	/** Storage access can throw when the browser blocks it; every helper catches that. */
	const store: Pick<Storage, 'getItem' | 'setItem'> = {
		getItem: (key) => localStorage.getItem(key),
		setItem: (key, value) => localStorage.setItem(key, value)
	};

	interface View {
		id: string;
		type: TileType;
		/** The one visible line. */
		title: string;
		/** Accessible name; it contains the visible line. */
		label: string;
		/** Name in announcements. */
		name: string;
		href: string;
		/** Id of the topic in the learning memory. */
		signal: string;
		art?: MotifId;
		graphic?: TileGraphicId;
		topic: boolean;
	}

	interface Frame {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	type Side = 'left' | 'right';
	type Entrance = 'above' | Side;

	interface Change {
		/** How a tile comes in. A tile that is new on screen falls from above. */
		enter?: Readonly<Record<string, Entrance>>;
		/** Falling blocks let go one after the other, the lowest row first. */
		stagger?: boolean;
		/** The tile under the finger keeps its place on screen. */
		held?: string;
		/** The tile that was just let go keeps the finger's speed. */
		released?: { id: string; velocity: Point };
	}

	interface Drag {
		id: string;
		start: Point;
		base: Pose;
		bounds: { left: number; right: number };
		fixed: boolean;
		reduced: boolean;
		place: number;
	}

	let grid: HTMLElement;
	let slots: Record<string, HTMLDivElement | null> = {};
	const running = new Map<string, Animation>();
	let drag: Drag | undefined;
	/** A queue change that arrived while a tile was leaving. */
	let pending: readonly QueueItem[] | undefined;

	let board = $state.raw<Board>(initialBoard(CORE));
	let queue = $state.raw<readonly QueueItem[]>([]);
	let poses = $state<Record<string, Pose>>({});
	let grabbed = $state<string>();
	let leaving = $state.raw<readonly string[]>([]);
	let announcement = $state('');
	let undo = $state.raw<{
		board: Board;
		/** The one entry "Erledigt" took out; undo puts only this back into the current queue. */
		removed: RemovedEntry;
		id: string;
		name: string;
		restoreSignal?: () => void;
	}>();
	let undoButton = $state<HTMLButtonElement>();

	let views = $derived.by(() => {
		const topics = new Map(queue.map((item) => [TOPIC + item.id, item]));
		return board.shown.flatMap((id): View[] => {
			const tile = CORE_TILES.get(id);
			if (tile) {
				const { type, title, art, graphic } = tile;
				const href = resolve(tile.path);
				return [
					{
						id,
						type,
						title,
						label: title,
						name: title,
						href,
						signal: id,
						art,
						graphic,
						topic: false
					}
				];
			}
			const item = topics.get(id);
			if (!item) return [];
			return [
				{
					id,
					type: item.type,
					title: shortTitle(item.title),
					label: `${TYPE_WORDS[item.type]}: ${item.title}`,
					name: item.title,
					href: resolve(item.route as Pathname),
					signal: item.id,
					graphic: TOPIC_GRAPHICS[item.type],
					topic: true
				}
			];
		});
	});
	let cells = $derived([...views.map(({ id }) => id), DAY]);
	let placeOf = $derived(new Map(cells.map((id, index) => [id, index])));
	/*
	 * Moving a node in the document releases its pointer capture. While a finger holds a tile the
	 * document order therefore stays as it was; only the grid cells change. It follows the board
	 * again as soon as the tile is let go.
	 */
	let frozen = $state.raw<readonly string[]>();
	let rendered = $derived(
		frozen
			? [...frozen.filter((id) => placeOf.has(id)), ...cells.filter((id) => !frozen!.includes(id))]
			: cells
	);
	let viewOf = $derived(new Map(views.map((view) => [view.id, view])));
	let portrait = $derived(bento(cells.length, 'portrait'));
	let landscape = $derived(bento(cells.length, 'landscape'));

	function topicIds(items: readonly QueueItem[]): string[] {
		return homeTopics(items, mode).map(({ id }) => TOPIC + id);
	}

	function currentQueue(event?: Event): QueueItem[] {
		const text = readLearningQueueText(store);
		if (text !== undefined) return parseLearningQueueText(text);
		// Without storage the event itself carries the queue.
		return parseLearningQueue(event instanceof CustomEvent ? event.detail : undefined);
	}

	function broadcast(items: unknown) {
		window.dispatchEvent(new CustomEvent(LEARNING_QUEUE_EVENT, { detail: items }));
	}

	function loadBoard(): Board {
		try {
			const stored = store.getItem(BOARD_KEY);
			return parseBoard(stored ? JSON.parse(stored) : null) ?? initialBoard(CORE);
		} catch {
			return initialBoard(CORE);
		}
	}

	function save(next: Board) {
		try {
			store.setItem(BOARD_KEY, JSON.stringify(next));
		} catch {
			// When storage is blocked, the board still lasts for this visit.
		}
	}

	function stop(id: string) {
		running.get(id)?.stop();
		running.delete(id);
	}

	/** `keep` leaves the block where the spring ends, for a tile that has left the screen. */
	function spring(
		id: string,
		from: Pose,
		to = REST,
		velocity?: Point,
		onRest?: () => void,
		keep = false
	) {
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
				if (!keep) delete poses[id];
				onRest?.();
			}
		});
		if (!finished) running.set(id, animation);
	}

	/** The block falls from above the screen into its slot and rebounds once. */
	function fallIn(id: string, height: number, delay: number) {
		stop(id);
		poses[id] = { ...REST, y: -height };
		let finished = false;
		const animation = animateFall({
			height,
			delay,
			onUpdate: (offset) => (poses[id] = { ...REST, y: offset }),
			onImpact: () => thud(id),
			onRest: () => {
				finished = true;
				running.delete(id);
				delete poses[id];
			}
		});
		if (!finished) running.set(id, animation);
	}

	/** The resting blocks right below a landing block give way and spring back. */
	function thud(id: string) {
		const box = slots[id]?.getBoundingClientRect();
		if (!box) return;
		for (const other of cells) {
			if (other === id || other === grabbed || poses[other]) continue;
			const below = slots[other]?.getBoundingClientRect();
			if (!below || below.left >= box.right || below.right <= box.left) continue;
			if (Math.abs(below.top - box.bottom) > IMPACT_PX) continue;
			spring(other, { ...REST, y: IMPACT_PX }, REST, STILL);
		}
	}

	function frames(): Map<string, Frame> {
		const result = new Map<string, Frame>();
		for (const id of cells) {
			const box = slots[id]?.getBoundingClientRect();
			if (box) result.set(id, { x: box.left, y: box.top, w: box.width, h: box.height });
		}
		return result;
	}

	/**
	 * Every confirmed change of the board runs through here: note where each block is drawn,
	 * apply the change, then let each block travel from there into its new slot. Blocks keep
	 * their size on the way and grow or shrink into the new cell.
	 */
	function relayout(apply: () => void, change: Change = {}) {
		const slotsBefore = frames();
		const drawn = new Map<string, Pose>();
		for (const [id, frame] of slotsBefore) {
			const pose = poses[id] ?? REST;
			drawn.set(id, {
				x: frame.x + pose.x,
				y: frame.y + pose.y,
				w: frame.w + pose.w,
				h: frame.h + pose.h,
				rotate: pose.rotate
			});
		}
		for (const id of [...running.keys()]) {
			if (id !== change.held) stop(id);
		}
		flushSync(apply);

		const slotsAfter = frames();
		const edge = grid.getBoundingClientRect();
		const falling: [string, Frame][] = [];
		for (const [id, frame] of slotsAfter) {
			const from = drawn.get(id);
			const entrance = change.enter?.[id] ?? (from ? undefined : 'above');
			if (id === change.held && drag?.id === id && from) {
				// The slot moved under the lifted block: shift its base so it stays under the finger.
				const before = slotsBefore.get(id)!;
				const shift = {
					x: before.x - frame.x,
					y: before.y - frame.y,
					w: before.w - frame.w,
					h: before.h - frame.h
				};
				const pose = { ...(poses[id] ?? REST) };
				const base = { ...drag.base };
				for (const axis of ['x', 'y', 'w', 'h'] as const) {
					base[axis] += shift[axis];
					pose[axis] += shift[axis];
				}
				drag.base = base;
				poses[id] = pose;
			} else if (entrance === 'above') {
				falling.push([id, frame]);
			} else if (entrance) {
				const x = entrance === 'left' ? edge.left - frame.x - frame.w : edge.right - frame.x;
				spring(id, { ...REST, x }, REST, STILL);
			} else if (from) {
				const velocity = change.released?.id === id ? change.released.velocity : STILL;
				spring(
					id,
					{
						x: from.x - frame.x,
						y: from.y - frame.y,
						w: from.w - frame.w,
						h: from.h - frame.h,
						rotate: from.rotate
					},
					REST,
					velocity
				);
			}
		}
		// The lowest row lands first; blocks above come to rest on it.
		falling.sort(([, a], [, b]) => b.y + b.h - (a.y + a.h) || a.x - b.x);
		falling.forEach(([id, frame], rank) => {
			fallIn(id, frame.y + frame.h - edge.top, change.stagger ? rank * STAGGER_SECONDS : 0);
		});
		for (const id of Object.keys(poses)) {
			if (!slotsAfter.has(id)) delete poses[id];
		}
		if (drag && !slotsAfter.has(drag.id)) finishDrag();
	}

	/** Tiles slide off one side of the screen and stay there until `then` changes the board. */
	function leave(
		ids: readonly string[],
		side: Side,
		velocity: Point | undefined,
		then: () => void
	) {
		const present = ids.filter((id) => slots[id]);
		if (present.length === 0) {
			then();
			return;
		}
		const edge = grid.getBoundingClientRect();
		let remaining = present.length;
		leaving = present;
		for (const id of present) {
			const box = slots[id]!.getBoundingClientRect();
			const pose = poses[id] ?? REST;
			const x = side === 'right' ? edge.right - box.left : edge.left - box.right - pose.w;
			spring(
				id,
				pose,
				{ ...pose, x, rotate: 0 },
				velocity,
				() => {
					remaining -= 1;
					if (remaining > 0) return;
					leaving = [];
					then();
					if (pending) receive(pending);
				},
				true
			);
		}
	}

	function focusTile(id: string | undefined) {
		if (id) slots[id]?.querySelector('a')?.focus();
	}

	function announcePlace(id: string) {
		const view = viewOf.get(id);
		const place = board.shown.indexOf(id) + 1;
		if (view) announcement = `Platz ${place} von ${board.shown.length}: ${view.name}`;
	}

	function reorder(id: string, target: string, held = false) {
		const next = moveTile(board, id, target);
		if (next === board) return;
		undo = undefined;
		relayout(() => (board = next), held ? { held: id } : undefined);
		save(next);
	}

	/** The queue changed, here or on another page: new topics fall in, finished ones leave. */
	function receive(items: readonly QueueItem[]) {
		if (JSON.stringify(items) === JSON.stringify(queue)) {
			pending = undefined;
			return;
		}
		if (leaving.length > 0) {
			pending = items;
			return;
		}
		pending = undefined;
		const sync = syncBoard(board, CORE, topicIds(items), TOPIC_SLOTS);
		const apply = () => {
			relayout(
				() => {
					queue = items;
					board = sync.board;
				},
				{ held: drag?.id }
			);
			save(sync.board);
			const names = sync.arrived.flatMap((id) => viewOf.get(id)?.name ?? []);
			if (names.length > 0) announcement = `Neu: ${names.join(', ')}`;
		};
		// A topic that has to wait makes room first, unless a finger holds a tile right now.
		if (drag) apply();
		else leave(sync.displaced, 'right', undefined, apply);
	}

	function throwTile(id: string, action: SwipeOutcome, velocity?: Point): boolean {
		if (id === DAY || leaving.length > 0 || !viewOf.has(id)) return false;
		leave([id], action === 'later' ? 'right' : 'left', velocity, () =>
			settle(id, action, !velocity)
		);
		return true;
	}

	/** The thrown tile is off screen: a finished topic leaves the queue, anything else goes back. */
	function settle(id: string, action: SwipeOutcome, fromKeys: boolean) {
		const view = viewOf.get(id);
		if (!view) return;
		if (view.topic && action === 'dismiss') {
			finishTopic(view, fromKeys);
			return;
		}
		if (view.topic) onHomeSignal?.(view.signal, 'keep');
		const next = sendBack(board, id, CORE);
		const back = next.shown.includes(id);
		undo = undefined;
		relayout(() => (board = next), back ? { enter: { [id]: 'left' } } : undefined);
		save(next);
		announcement = `Später: ${view.name}`;
		if (fromKeys) focusTile(back ? id : next.shown[0]);
	}

	/*
	 * "Erledigt" writes first. Only a stored removal changes the board, the learning signal and the
	 * announcement; when storage refuses, the tile comes back and nothing is confirmed.
	 */
	function finishTopic(view: View, fromKeys: boolean) {
		const change = removeFromLearningQueue(store, view.signal);
		if (!change) {
			undo = undefined;
			relayout(() => {}, { enter: { [view.id]: 'left' } });
			announcement = `Nicht gespeichert: ${view.name}`;
			if (fromKeys) focusTile(view.id);
			return;
		}
		const before = board;
		const restoreSignal = onHomeSignal?.(view.signal, 'dismiss') || undefined;
		const items = change.items;
		const next = syncBoard(board, CORE, topicIds(items), TOPIC_SLOTS).board;
		relayout(() => {
			queue = items;
			board = next;
		});
		save(next);
		broadcast(items);
		undo = change.removed
			? { board: before, removed: change.removed, id: view.id, name: view.name, restoreSignal }
			: undefined;
		announcement = `Erledigt: ${view.name}`;
		if (fromKeys) void tick().then(() => (undo ? undoButton : undefined)?.focus());
	}

	/* Undo puts only the one finished entry back into the queue as it stands now. */
	function undoLast() {
		if (!undo || drag || leaving.length > 0) return;
		const last = undo;
		const items = restoreToLearningQueue(store, last.removed);
		if (!items) {
			announcement = `Nicht gespeichert: ${last.name}`;
			return;
		}
		undo = undefined;
		last.restoreSignal?.();
		const next = syncBoard(last.board, CORE, topicIds(items), TOPIC_SLOTS).board;
		relayout(
			() => {
				queue = items;
				board = next;
			},
			{ enter: { [last.id]: 'left' } }
		);
		save(next);
		broadcast(items);
		announcement = `Zurück: ${last.name}`;
		focusTile(last.id);
	}

	function tileUnder(pointer: Point, self: string): string | undefined {
		return board.shown.find((id) => {
			const box = id === self ? undefined : slots[id]?.getBoundingClientRect();
			return (
				box &&
				pointer.x >= box.left &&
				pointer.x < box.right &&
				pointer.y >= box.top &&
				pointer.y < box.bottom
			);
		});
	}

	function beginDrag(id: string, start: Point) {
		stop(id);
		const { left, right } = grid.getBoundingClientRect();
		drag = {
			id,
			start,
			base: poses[id] ?? REST,
			bounds: { left, right },
			fixed: id === DAY,
			reduced: prefersReducedMotion(),
			place: board.shown.indexOf(id)
		};
		grabbed = id;
		frozen = rendered;
	}

	/** The lifted block follows the finger; the tile it is carried over makes room at once. */
	function moveDrag(id: string, pointer: Point, velocity: Point) {
		if (drag?.id !== id) return;
		const offset = blockOffset(drag.start, pointer, drag.bounds, drag.fixed);
		const tilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, velocity.x / TILT_SPEED));
		poses[id] = {
			...drag.base,
			x: drag.base.x + offset.x,
			y: drag.base.y + offset.y,
			rotate: drag.reduced ? 0 : tilt
		};
		if (drag.fixed) return;
		const target = tileUnder(pointer, id);
		if (target) reorder(id, target, true);
	}

	function finishDrag() {
		drag = undefined;
		grabbed = undefined;
		frozen = undefined;
	}

	function cancelDrag(id: string) {
		finishDrag();
		spring(id, poses[id] ?? REST, REST, STILL);
	}

	function release(id: string, pointer: Point, velocity: Point) {
		const active = drag;
		if (active?.id !== id) return;
		moveDrag(id, pointer, velocity);
		finishDrag();
		const action = wushAction(active.start, pointer, velocity, active.bounds, active.fixed);
		if (action && throwTile(id, action, velocity)) return;
		spring(id, poses[id] ?? REST, REST, velocity);
		if (board.shown.indexOf(id) !== active.place) announcePlace(id);
	}

	function keyMove(event: KeyboardEvent, id: string) {
		const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
		if (!event.altKey || step === undefined || grabbed || leaving.length > 0) return;
		event.preventDefault();
		const target = board.shown[board.shown.indexOf(id) + step];
		if (!target) {
			announcement = 'Rand des Rasters';
			return;
		}
		reorder(id, target);
		announcePlace(id);
		focusTile(id);
	}

	const gesture = tileGesture({
		targetFor(event) {
			if (leaving.length > 0 || !(event.target instanceof Element)) return;
			const anchor = event.target.closest<HTMLElement>('a.tile-link');
			const id = anchor?.closest<HTMLElement>('[data-home-tile]')?.dataset.homeTile;
			if (anchor && id) return { id, anchor };
		},
		onInput: () => {},
		onGrab: beginDrag,
		onMove: moveDrag,
		onDrop: release,
		onCancel: cancelDrag
	});

	/** The stored board and the queue come in; on a fresh page every block falls into place. */
	function start() {
		const late = !hydrated && performance.now() > LATE_HYDRATION_MS;
		hydrated = true;
		const items = currentQueue();
		const next = syncBoard(loadBoard(), CORE, topicIds(items), TOPIC_SLOTS).board;
		const entrance = !late && document.visibilityState === 'visible';
		relayout(
			() => {
				queue = items;
				board = next;
			},
			entrance
				? {
						enter: Object.fromEntries([...next.shown, DAY].map((id) => [id, 'above'])),
						stagger: true
					}
				: undefined
		);
		save(next);
	}

	$effect(() => {
		// The first layout change waits until the effects have run (flushSync must not run in one).
		let mounted = true;
		queueMicrotask(() => {
			if (mounted) untrack(start);
		});
		const onQueue = (event: Event) => receive(currentQueue(event));
		const onStorage = (event: StorageEvent) => {
			if (event.key === LEARNING_QUEUE_KEY || event.key === null) receive(currentQueue());
		};
		window.addEventListener(LEARNING_QUEUE_EVENT, onQueue);
		window.addEventListener('storage', onStorage);
		return () => {
			mounted = false;
			window.removeEventListener(LEARNING_QUEUE_EVENT, onQueue);
			window.removeEventListener('storage', onStorage);
			for (const id of [...running.keys()]) stop(id);
		};
	});
</script>

<p id="home-hint" class="visually-hidden">
	Alt und Pfeiltasten verschieben eine Kachel. Später stellt sie nach hinten, Erledigt nimmt ein
	Thema aus der Lernliste.
</p>
<p class="visually-hidden" aria-live="polite">{announcement}</p>

<nav aria-label="Bereiche" data-home-grid bind:this={grid} {@attach gesture}>
	<TileGrid {portrait} {landscape}>
		{#each rendered as id (id)}
			{@const index = placeOf.get(id) ?? 0}
			{@const view = viewOf.get(id)}
			{@const pose = poses[id]}
			<div
				bind:this={slots[id]}
				class="slot"
				class:moving={!!pose}
				style:--portrait-area={gridArea(portrait.cells[index])}
				style:--portrait-top={portrait.cells[index].top ? 1 : 0}
				style:--portrait-left={portrait.cells[index].left ? 1 : 0}
				style:--landscape-area={gridArea(landscape.cells[index])}
				style:--landscape-top={landscape.cells[index].top ? 1 : 0}
				style:--landscape-left={landscape.cells[index].left ? 1 : 0}
				data-home-tile={id}
				data-slot={index}
				data-bed={index}
				data-lifted={grabbed === id || leaving.includes(id) ? '' : undefined}
			>
				<div
					class="block"
					style:translate={pose ? `${pose.x}px ${pose.y}px` : undefined}
					style:rotate={pose?.rotate ? `${pose.rotate}deg` : undefined}
					style:inline-size={pose?.w ? `calc(100% + ${pose.w}px)` : undefined}
					style:block-size={pose?.h ? `calc(100% + ${pose.h}px)` : undefined}
				>
					{#if view}
						<Tile
							type={view.type}
							title={view.title}
							href={view.href}
							ariaLabel={view.label}
							art={view.art}
							graphic={view.graphic}
							queued={view.topic}
							sizes={SIZES}
							priority={index === 0}
							ariaDescribedby="home-hint"
							ariaKeyshortcuts={SHORTCUTS}
							onkeydown={(event) => keyMove(event, id)}
							onclick={() => onHomeSignal?.(view.signal, 'open')}
						/>
						<div class="keys" role="group" aria-label="Aktionen für {view.name}">
							<button
								type="button"
								class="m-icon-button"
								aria-label="Später: {view.name}"
								onclick={() => throwTile(id, 'later')}
							>
								<Icon name="arrow-right" />
							</button>
							{#if view.topic}
								<button
									type="button"
									class="m-icon-button"
									aria-label="Erledigt: {view.name}"
									onclick={() => throwTile(id, 'dismiss')}
								>
									<Icon name="check" />
								</button>
							{/if}
						</div>
					{:else}
						<!-- The day tile always holds the bottom right corner (bento.ts), where the duck stands. -->
						<TodayTile
							done={todayDone}
							planned={todayPlanned}
							href={resolve('/aktivitaet')}
							clearDuckCorner
						/>
					{/if}
				</div>
			</div>
		{/each}
	</TileGrid>

	{#if undo}
		<button
			bind:this={undoButton}
			type="button"
			class="m-icon-button undo"
			aria-label="Rückgängig: {undo.name}"
			onclick={undoLast}
		>
			<Icon name="undo" />
		</button>
	{/if}
</nav>

<style>
	nav {
		position: relative;
		block-size: 100%;
		overflow: clip;
		background: var(--palette-paper);
	}

	/* The slot is the fixed place in the grid; the block is the tile that moves in and out of it. */
	.slot {
		position: relative;
		min-inline-size: 0;
		min-block-size: 0;
		touch-action: pan-y;
	}

	.block {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		display: grid;
		inline-size: 100%;
		block-size: 100%;
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

	/* A lifted tile carries the ink edge (DESIGN.md §3.4); there is no shadow. */
	.slot[data-lifted] .block::after {
		position: absolute;
		inset: 0;
		border: var(--edge-width) solid var(--palette-ink);
		content: '';
		pointer-events: none;
	}

	/* The way without a swipe: the round keys show while the keyboard is on the tile. */
	.keys {
		position: absolute;
		inset-block-start: var(--space-s);
		inset-inline-end: var(--space-s);
		display: flex;
		gap: var(--space-s);
	}

	.block:not(:has(:focus-visible)) .keys,
	.slot[data-lifted] .keys {
		clip-path: inset(50%);
		pointer-events: none;
	}

	/* The start page has no home link, so its corner holds the one way back after "Erledigt". */
	.undo {
		position: absolute;
		inset-block-start: var(--shell-edge);
		inset-inline-end: var(--shell-edge);
		z-index: 4;
	}
</style>
