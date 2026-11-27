<script lang="ts">
	import { INKS, clampUnit, strokeHit, type InkColor, type Point, type Stroke } from './strokes.js';

	interface Props {
		strokes: readonly Stroke[];
		tool: 'pen' | 'eraser';
		color: InkColor;
		/** Points the board may still take before the contract limit. */
		pointBudget: number;
		/** Include the undo key in the help when the caller handles it. */
		undoShortcut?: boolean;
		/** Called once before a gesture changes the strokes, so the caller can keep undo history. */
		onbeforechange: () => void;
		onchange: (strokes: Stroke[]) => void;
		onlimit: () => void;
		onstatus: (message: string) => void;
		/** The long side of the board in CSS pixels: one board unit. */
		onscale?: (scale: number) => void;
	}

	let {
		strokes,
		tool,
		color,
		pointBudget,
		undoShortcut = false,
		onbeforechange,
		onchange,
		onlimit,
		onstatus,
		onscale
	}: Props = $props();

	const STROKE_WIDTH = 2.5;
	// Minimum movement between stored points, in board units; filters jitter, saves budget.
	const MIN_STEP = 0.003;
	const ERASER_RADIUS = 0.015;
	const KEY_STEP = 0.015;
	const KEY_STEP_FINE = 0.004;
	const CURSOR_SIZE = 7;

	const id = $props.id();
	let canvas = $state<HTMLCanvasElement>();
	let size = $state({ width: 0, height: 0, ratio: 1 });
	let scale = $derived(Math.max(size.width, size.height));
	let focused = $state(false);
	// Crosshair and key help belong to real keyboard use only, never to touch or mouse drawing.
	let keyboard = $state(false);
	let cursor = $state<Point>({ x: 0.2, y: 0.4 });
	let keyboardPenDown = $state(false);
	let showKeys = $derived(focused && keyboard);

	// Gesture state is plain data; the canvas is redrawn by hand while it changes.
	let draft: Stroke | null = null;
	let erasing = false;
	let erasedThisGesture = false;
	// One pointer draws at a time; a second finger or palm must not split or end the gesture.
	let activePointerId: number | null = null;

	$effect(() => {
		if (!canvas) return;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			size = { width, height, ratio: window.devicePixelRatio || 1 };
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (scale) onscale?.(scale);
	});

	// Backing store follows CSS size times device pixel ratio, so lines stay sharp on HiDPI.
	$effect(() => {
		if (!canvas || !size.width) return;
		const width = Math.round(size.width * size.ratio);
		const height = Math.round(size.height * size.ratio);
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		// draw() reads strokes, cursor and tool, so the effect redraws when they change.
		draw();
	});

	function draw() {
		const context = canvas?.getContext('2d');
		if (!context || !size.width) return;
		const { width, height, ratio } = size;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		const ink = getComputedStyle(canvas!).color;
		for (const stroke of draft ? [...strokes, draft] : strokes) drawStroke(context, stroke, ink);
		if (showKeys) drawCursor(context, ink);
	}

	function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, ink: string) {
		const [first, ...rest] = stroke.points;
		if (!first) return;
		const paint = stroke.color === INKS[0].color ? ink : stroke.color;
		context.strokeStyle = paint;
		context.fillStyle = paint;
		context.lineWidth = STROKE_WIDTH;
		context.lineCap = 'round';
		context.lineJoin = 'round';
		if (!rest.length) {
			context.beginPath();
			context.arc(first.x * scale, first.y * scale, STROKE_WIDTH / 2, 0, Math.PI * 2);
			context.fill();
			return;
		}
		context.beginPath();
		context.moveTo(first.x * scale, first.y * scale);
		for (const point of rest) context.lineTo(point.x * scale, point.y * scale);
		context.stroke();
	}

	/** A square crosshair: the eraser shows its reach, the pen a small frame. */
	function drawCursor(context: CanvasRenderingContext2D, ink: string) {
		const x = cursor.x * scale;
		const y = cursor.y * scale;
		const half = tool === 'eraser' ? ERASER_RADIUS * scale : CURSOR_SIZE;
		context.lineWidth = 1;
		context.strokeStyle = ink;
		context.strokeRect(x - half, y - half, half * 2, half * 2);
		context.beginPath();
		context.moveTo(x - half - 5, y);
		context.lineTo(x + half + 5, y);
		context.moveTo(x, y - half - 5);
		context.lineTo(x, y + half + 5);
		context.stroke();
		if (keyboardPenDown) {
			context.fillStyle = color === INKS[0].color ? ink : color;
			context.fillRect(x - 3, y - 3, 6, 6);
		}
	}

	function boardPoint(event: PointerEvent): Point {
		const rect = canvas!.getBoundingClientRect();
		return {
			x: clampUnit((event.clientX - rect.left) / scale),
			y: clampUnit((event.clientY - rect.top) / scale)
		};
	}

	function startStroke(point: Point): boolean {
		if (pointBudget < 1) {
			onlimit();
			return false;
		}
		draft = { color, points: [point] };
		return true;
	}

	function extendStroke(point: Point) {
		if (!draft) return;
		const last = draft.points.at(-1)!;
		if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP) return;
		if (draft.points.length >= pointBudget) {
			onlimit();
			return;
		}
		draft.points.push(point);
	}

	function finishStroke() {
		if (!draft) return;
		const finished = draft;
		draft = null;
		onbeforechange();
		onchange([...strokes, finished]);
	}

	function eraseAt(point: Point) {
		const kept = strokes.filter((stroke) => !strokeHit(stroke, point, ERASER_RADIUS));
		if (kept.length === strokes.length) return;
		if (!erasedThisGesture) onbeforechange();
		erasedThisGesture = true;
		onchange(kept);
	}

	function pointerDown(event: PointerEvent) {
		keyboard = false;
		if (activePointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		activePointerId = event.pointerId;
		canvas!.setPointerCapture(event.pointerId);
		const point = boardPoint(event);
		if (tool === 'eraser') {
			erasing = true;
			erasedThisGesture = false;
			eraseAt(point);
			return;
		}
		if (startStroke(point)) draw();
	}

	function pointerMove(event: PointerEvent) {
		if (event.pointerId !== activePointerId) return;
		if (!draft && !erasing) return;
		// Coalesced events keep fast pen strokes smooth on high-frequency digitisers.
		const events = event.getCoalescedEvents?.() ?? [event];
		for (const sample of events.length ? events : [event]) {
			const point = boardPoint(sample);
			if (erasing) eraseAt(point);
			else extendStroke(point);
		}
		draw();
	}

	function pointerUp(event: PointerEvent) {
		if (event.pointerId !== activePointerId) return;
		activePointerId = null;
		erasing = false;
		finishStroke();
	}

	function liftKeyboardPen() {
		keyboardPenDown = false;
		finishStroke();
		onstatus('Stift abgehoben, Strich gespeichert.');
	}

	function toggleKeyboardPen() {
		if (tool === 'eraser') {
			erasedThisGesture = false;
			eraseAt(cursor);
			onstatus('Radiert an der Kreuzposition.');
			return;
		}
		if (keyboardPenDown) {
			liftKeyboardPen();
			return;
		}
		keyboardPenDown = startStroke(cursor);
		if (keyboardPenDown) onstatus('Stift aufgesetzt. Pfeiltasten zeichnen.');
	}

	const ARROWS: Record<string, Point> = {
		ArrowLeft: { x: -1, y: 0 },
		ArrowRight: { x: 1, y: 0 },
		ArrowUp: { x: 0, y: -1 },
		ArrowDown: { x: 0, y: 1 }
	};

	/** The part of the unit square this board shows; the cursor stays inside it. */
	function limits(): Point {
		return { x: size.width / scale || 1, y: size.height / scale || 1 };
	}

	function keyDown(event: KeyboardEvent) {
		const direction = ARROWS[event.key];
		if (direction) {
			event.preventDefault();
			keyboard = true;
			const step = event.shiftKey ? KEY_STEP_FINE : KEY_STEP;
			const edge = limits();
			cursor = {
				x: Math.min(clampUnit(cursor.x + direction.x * step), edge.x),
				y: Math.min(clampUnit(cursor.y + direction.y * step), edge.y)
			};
			if (keyboardPenDown) extendStroke(cursor);
			return;
		}
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			keyboard = true;
			toggleKeyboardPen();
			return;
		}
		if (event.key === 'Escape' && keyboardPenDown) liftKeyboardPen();
	}

	function focus() {
		focused = true;
		// Only a keyboard focus matches :focus-visible; a tap or click does not.
		keyboard = canvas?.matches(':focus-visible') ?? false;
	}

	function focusOut() {
		focused = false;
		if (keyboardPenDown) liftKeyboardPen();
	}
</script>

<canvas
	bind:this={canvas}
	class="board"
	tabindex="0"
	aria-label="Zeichenfläche"
	aria-describedby="{id}-keys"
	onpointerdown={pointerDown}
	onpointermove={pointerMove}
	onpointerup={pointerUp}
	onpointercancel={pointerUp}
	onkeydown={keyDown}
	onfocus={focus}
	onblur={focusOut}
></canvas>
<!-- Always there for screen readers; visible only while the keyboard draws (V2-6). -->
<p id="{id}-keys" class="keys" class:visually-hidden={!showKeys}>
	Pfeile bewegen das Kreuz, Umschalt fein. Leertaste setzt den Stift auf und hebt ab.
	{#if undoShortcut}Strg+Z nimmt den letzten Strich zurück.{/if}
</p>

<style>
	/*
	 * The board takes the large viewport height: when the browser bar comes and goes, the board
	 * and its unit stay the same size; the part under the bar is simply out of sight.
	 */
	.board {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		display: block;
		inline-size: 100%;
		block-size: var(--board-height, 100lvh);
		background: var(--surface);
		color: var(--text);
		cursor: crosshair;
		touch-action: none;
		overscroll-behavior: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.board:focus-visible {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: calc(-1 * var(--focus-width));
	}

	.keys {
		position: absolute;
		inset-inline: var(--gutter);
		inset-block-end: var(
			--board-help-inset,
			calc(var(--cell) + var(--step-2) + env(safe-area-inset-bottom))
		);
		max-inline-size: 40ch;
		font-family: var(--font-mono);
		font-size: var(--type-label);
		line-height: var(--line-body);
		pointer-events: none;
	}
</style>
