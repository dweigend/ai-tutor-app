<script lang="ts">
	import { screenContext } from '$lib/memory/runtime.svelte';
	import { untrack, type Snippet } from 'svelte';
	import type { TaskRef, TutorApiClient, WhiteboardSnapshot } from '$lib/api/types';
	import { tutorScenarios } from '$lib/content/tutor';
	import { nextChallenge, type WhiteboardChallenge } from '$lib/content/whiteboard-challenges';
	import { BoardCanvas, PageHead, BottomBar, IconButton } from '$lib/modules';
	import SketchHistory from './SketchHistory.svelte';
	import ToolMenu, { type ToolAction } from './ToolMenu.svelte';
	import TutorLine from './TutorLine.svelte';
	import { rememberEdit, stepEdit, type EditHistory } from './history';
	import { demoRefiner } from './refine';
	import { selectTool, type BoardTool } from './tool-selection';
	import {
		SKETCH_LIMIT,
		addSketch,
		exportFileName,
		keepSketch,
		readSketches,
		removeSketches,
		writeSketches,
		type SavedSketch
	} from './sketches';
	import {
		INKS,
		MAX_POINTS,
		anchorPoint,
		countPoints,
		fitStrokes,
		toSnapshot,
		toSvg,
		type InkColor,
		type Stroke,
		type View
	} from './strokes';
	import { IDLE, applyEvent, lineText, whiteboardTurn, type TutorLine as Line } from './tutor-line';

	interface Props {
		client: TutorApiClient;
		/** The tutor task the live question belongs to, unless a challenge brings its own. */
		task: TaskRef;
		/** Controls in the top row: the way out. */
		top?: Snippet;
	}

	let { client, task, top }: Props = $props();

	const boardId = crypto.randomUUID();
	let strokes = $state.raw<Stroke[]>([]);
	let history = $state.raw<EditHistory>({ undo: [], redo: [] });
	let revision = $state(0);
	let selection = $state.raw<{ tool: BoardTool; color: InkColor }>({
		tool: 'pen',
		color: INKS[0].color
	});
	let { tool, color } = $derived(selection);
	let status = $state('');
	let note = $state('');
	let challenge = $state<WhiteboardChallenge | null>(null);

	let width = $state(0);
	let height = $state(0);
	let scale = $state(0);
	let topHeight = $state(0);
	let bottomHeight = $state(0);
	let view = $derived<View>({ x: scale ? width / scale : 1, y: scale ? height / scale : 1 });
	let points = $derived(countPoints(strokes));

	// A sketch handed in before the board knows its size waits for the first measurement.
	let pendingLoad: Stroke[] | null = null;

	function remember() {
		history = rememberEdit(history, strokes);
	}

	function commit(next: Stroke[]) {
		strokes = next;
		revision += 1;
		note = '';
	}

	function step(direction: keyof EditHistory) {
		const edit = stepEdit(history, strokes, direction);
		if (!edit) return;
		history = edit.history;
		commit(edit.strokes);
		status = direction === 'undo' ? 'Zurück.' : 'Wiederhergestellt.';
	}

	function replace(next: Stroke[], message: string) {
		remember();
		commit(next);
		status = message;
	}

	/** Puts strokes from elsewhere on the board, fitted into view; undo brings back the old state. */
	export function load(next: Stroke[]) {
		if (!scale) {
			pendingLoad = next;
			return;
		}
		replace(fitStrokes(next, view), 'Skizze geladen.');
	}

	/** The board as the API sees it, or null when it is empty. */
	export function current(): WhiteboardSnapshot | null {
		return strokes.length ? toSnapshot(strokes, boardId, revision) : null;
	}

	$effect(() => {
		if (!scale || !pendingLoad) return;
		const next = pendingLoad;
		pendingLoad = null;
		load(next);
	});

	function choose(choice: { tool: BoardTool } | { color: InkColor }) {
		selection = selectTool(selection, choice);
		const ink = INKS.find((entry) => entry.color === selection.color)?.name;
		status = selection.tool === 'eraser' ? 'Radierer.' : `Stift ${ink}.`;
	}

	// ---- Saved sketches: local only ------------------------------------------------------------

	let sketches = $state.raw<SavedSketch[]>([]);
	let stored = $state(true);
	let historyOpen = $state(false);
	let saveBlocked = $state(false);

	function storage(): Storage | undefined {
		try {
			return window.localStorage;
		} catch {
			return undefined;
		}
	}

	$effect(() => {
		sketches = readSketches(storage());
	});

	function persist(next: SavedSketch[]) {
		sketches = next;
		stored = writeSketches(storage(), next);
	}

	function save() {
		const sketch: SavedSketch = {
			id: crypto.randomUUID(),
			savedAt: new Date().toISOString(),
			strokes,
			kept: false
		};
		const next = addSketch(sketches, sketch);
		saveBlocked = next === null;
		historyOpen = true;
		if (!next) {
			status = '';
			return;
		}
		persist(next);
		status = 'Gespeichert.';
	}

	/** One click, one format: SVG (art direction V2-6, no PNG-or-SVG choice). */
	function exportSketch() {
		const blob = new Blob([toSvg(strokes, view)], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = exportFileName(new Date());
		link.click();
		setTimeout(() => URL.revokeObjectURL(url));
		status = `Exportiert als ${link.download}.`;
	}

	// ---- Glätten -------------------------------------------------------------------------------

	async function refine() {
		const result = await demoRefiner.refine(strokes);
		replace(result.strokes, 'Linien geglättet.');
	}

	function act(action: ToolAction) {
		switch (action) {
			case 'undo':
				return step('undo');
			case 'clear':
				return replace([], 'Fläche geleert.');
			case 'save':
				return save();
			case 'refine':
				return void refine();
			case 'challenge':
				challenge = nextChallenge(challenge);
				status = `${challenge.title}. ${challenge.spoken}`;
		}
	}

	// ---- Live tutor ----------------------------------------------------------------------------

	let line = $state<Line>(IDLE);
	let shown = $derived(lineText(line));
	let busy = $derived(line.phase === 'asking' || line.phase === 'streaming');
	let controller: AbortController | undefined;

	let askTask = $derived.by(() => {
		const scenario = challenge?.scenarioId
			? tutorScenarios.find((entry) => entry.id === challenge?.scenarioId)
			: undefined;
		return scenario?.task ?? task;
	});
	$effect(() => {
		const context = {
			route: '/whiteboard',
			taskRef: askTask,
			courseId: askTask.courseId,
			topic: challenge?.title ?? 'Whiteboard',
			sectionId: challenge?.id,
			sectionTitle: challenge?.text,
			sketchSummary: `${strokes.length} Striche, ${points} Punkte`
		};
		untrack(() => screenContext.setScreen(context));
	});
	let session = { key: '', id: '', revision: 0 };

	function sessionFor(target: TaskRef, fresh = false) {
		const key = `${target.courseId}/${target.courseVersion}/${target.taskId}`;
		if (fresh || session.key !== key) session = { key, id: crypto.randomUUID(), revision: 0 };
		return session;
	}

	async function ask() {
		const snapshot = current();
		if (!snapshot) return;
		controller?.abort();
		const own = new AbortController();
		controller = own;
		line = { phase: 'asking' };
		const target = askTask;
		// A conflict means the session moved on elsewhere (or an aborted reply); one fresh retry.
		for (let attempt = 0; attempt < 2; attempt += 1) {
			const active = sessionFor(target, attempt > 0);
			const request = whiteboardTurn({
				task: target,
				sessionId: active.id,
				expectedRevision: active.revision,
				requestId: crypto.randomUUID(),
				snapshot
			});
			let next: Line = { phase: 'asking' };
			try {
				for await (const event of client.streamTurn(request, own.signal)) {
					if (own.signal.aborted) return;
					next = applyEvent(next, event);
					line = next;
				}
			} catch {
				if (own.signal.aborted) return;
				line = { phase: 'error', text: 'Gerade nicht erreichbar.', code: 'network' };
				return;
			}
			if (next.phase === 'done') {
				active.revision = next.revision;
				status = `Tutor fragt: ${next.text}`;
				return;
			}
			if (!(next.phase === 'error' && next.code === 'conflict')) return;
		}
	}

	function closeLine() {
		controller?.abort();
		controller = undefined;
		line = IDLE;
	}

	// Leaving the page ends a running reply; nothing streams into a board nobody sees.
	$effect(() => () => controller?.abort());

	let anchorTop = $derived.by(() => {
		const point = anchorPoint(strokes, 'top');
		return point && { x: point.x * scale, y: point.y * scale };
	});
	let anchorBottom = $derived.by(() => {
		const point = anchorPoint(strokes, 'bottom');
		return point && { x: point.x * scale, y: point.y * scale };
	});

	function keyDown(event: KeyboardEvent) {
		if (historyOpen || event.defaultPrevented) return;
		const editing = 'input,textarea,[contenteditable],dialog[open],[role="dialog"]';
		if (
			document.activeElement?.closest(editing) ||
			(event.target instanceof Element && event.target.closest(editing))
		)
			return;
		if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;
		const key = event.key.toLowerCase();
		if (key === 'z') {
			event.preventDefault();
			step(event.shiftKey ? 'redo' : 'undo');
		} else if (event.ctrlKey && key === 'y') {
			event.preventDefault();
			step('redo');
		}
	}
</script>

<svelte:window onkeydown={keyDown} />

<div
	class="whiteboard"
	data-surface="paper"
	role="group"
	aria-label="Whiteboard"
	data-strokes={strokes.length}
	data-points={points}
	bind:clientWidth={width}
	bind:clientHeight={height}
>
	<BoardCanvas
		{strokes}
		{tool}
		{color}
		pointBudget={MAX_POINTS - points}
		undoShortcut
		onbeforechange={remember}
		onchange={commit}
		onlimit={() => {
			note = 'Fläche voll';
			status = 'Fläche voll – radiere oder leere sie.';
		}}
		onstatus={(message) => (status = message)}
		onscale={(value) => (scale = value)}
	/>

	<div class="board-top" bind:offsetHeight={topHeight}>
		<PageHead title="Whiteboard" accent="whiteboard" left={top} />
		{#if challenge}
			<p class="board-challenge info-band" data-row>
				<strong>{challenge.title}</strong>
				<span aria-hidden="true">{challenge.text}</span>
				<span class="visually-hidden">{challenge.spoken}</span>
			</p>
		{/if}
	</div>

	{#if shown}
		<TutorLine
			text={shown}
			{anchorTop}
			{anchorBottom}
			topLimit={topHeight}
			bottomLimit={height - bottomHeight}
			{width}
			onclose={closeLine}
		/>
	{/if}

	<div class="board-controls" bind:offsetHeight={bottomHeight}>
		<BottomBar class="board-bottom" fixed={false}>
			<ToolMenu
				{tool}
				{color}
				canUndo={history.undo.length > 0}
				hasStrokes={strokes.length > 0}
				onselectTool={(selected) => choose({ tool: selected })}
				onselectColor={(selected) => choose({ color: selected })}
				onaction={act}
			/>
			<p class="board-note">{note}</p>
			{#if strokes.length}
				<IconButton label="Rückfrage zur Skizze" icon="duck" disabled={busy} onclick={ask} />
			{/if}
		</BottomBar>
	</div>

	<p class="visually-hidden" role="status">{status}</p>
</div>

<SketchHistory
	bind:open={historyOpen}
	{sketches}
	{stored}
	saveMessage={saveBlocked &&
	sketches.length === SKETCH_LIMIT &&
	sketches.every((item) => item.kept)
		? `Alle ${SKETCH_LIMIT} Plätze belegt.`
		: undefined}
	onload={(sketch) => load(sketch.strokes)}
	onremove={(ids) => persist(removeSketches(sketches, ids))}
	onkeep={(id, kept) => persist(keepSketch(sketches, id, kept))}
	onexport={exportSketch}
/>

<style>
	.whiteboard {
		position: relative;
		inline-size: 100%;
		block-size: 100dvh;
		overflow: hidden;
		overscroll-behavior: none;
	}

	:global(html:has(.whiteboard)),
	:global(body:has(.whiteboard)) {
		overscroll-behavior: none;
	}

	/* The overlays let the pen through; only their controls take a touch. */
	.board-top,
	.board-controls {
		position: absolute;
		inset-inline: 0;
		z-index: 6;
		pointer-events: none;
	}

	.board-top {
		inset-block-start: 0;
	}
	.board-top :global(a),
	.board-top :global(button),
	.board-controls :global([data-bottom-bar]) {
		pointer-events: auto;
	}

	.board-challenge {
		display: grid;
		align-content: center;
		gap: 4px;
		min-block-size: var(--bar);
		padding-inline: var(--gutter);
		font-family: var(--font-ui);
		font-size: var(--type-label);
		line-height: 1.3;
	}

	.board-controls {
		inset-block-end: 0;
	}

	.board-note {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		font-family: var(--font-ui);
		font-size: var(--type-label);
		font-variant-numeric: tabular-nums;
		text-align: center;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
