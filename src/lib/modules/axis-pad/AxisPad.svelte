<script lang="ts">
	interface Axis {
		min: number;
		max: number;
		step: number;
		/** Name of the quantity, e.g. `η`. */
		unit: string;
	}

	interface Props {
		x: Axis;
		y: Axis;
		valueX: number;
		valueY: number;
		label: string;
		format?: (value: number) => string;
		onchange?: (x: number, y: number) => void;
	}

	let {
		x,
		y,
		valueX = $bindable(),
		valueY = $bindable(),
		label,
		format = (value) => value.toFixed(2).replace('.', ','),
		onchange
	}: Props = $props();

	let pad = $state<HTMLElement>();
	let gripHit = $state<HTMLElement>();
	let dragging = false;

	const snap = (axis: Axis, value: number) => {
		const clamped = Math.min(Math.max(value, axis.min), axis.max);
		const steps = Math.round((clamped - axis.min) / axis.step);
		return Number((axis.min + steps * axis.step).toFixed(6));
	};
	const share = (axis: Axis, value: number) => (value - axis.min) / (axis.max - axis.min);

	let left = $derived(share(x, valueX) * 100);
	let top = $derived((1 - share(y, valueY)) * 100);
	let valuetext = $derived(`${x.unit} ${format(valueX)}, ${y.unit} ${format(valueY)}`);

	function set(nextX: number, nextY: number) {
		const sx = snap(x, nextX);
		const sy = snap(y, nextY);
		if (sx === valueX && sy === valueY) return;
		valueX = sx;
		valueY = sy;
		onchange?.(sx, sy);
	}

	function fromPointer(event: PointerEvent) {
		const rect = pad?.querySelector('.axes')?.getBoundingClientRect();
		if (!rect) return;
		const fx = (event.clientX - rect.left) / rect.width;
		const fy = 1 - (event.clientY - rect.top) / rect.height;
		set(x.min + fx * (x.max - x.min), y.min + fy * (y.max - y.min));
	}

	function down(event: PointerEvent) {
		gripHit?.focus({ preventScroll: true });
		dragging = true;
		pad?.setPointerCapture(event.pointerId);
		fromPointer(event);
	}

	function move(event: PointerEvent) {
		if (dragging) fromPointer(event);
	}

	function up() {
		dragging = false;
	}

	function key(event: KeyboardEvent) {
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowDown: [0, -1],
			ArrowUp: [0, 1]
		};
		const delta = moves[event.key];
		if (!delta) return;
		event.preventDefault();
		set(valueX + delta[0] * x.step, valueY + delta[1] * y.step);
	}
</script>

<!--
	P5 AxisPad (DESIGN.md §11): two axes, one grip. The grip is the shared 28px orange circle with
	an ink line and a 44px target (§2.3). Arrow keys step each axis; the frame is the instrument's
	one border (§2.2).
-->
<div class="axis-pad">
	<div
		class="pad"
		bind:this={pad}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		role="presentation"
	>
		<div class="axes">
			<span class="cross cross-x" style:top="{top}%"></span>
			<span class="cross cross-y" style:left="{left}%"></span>
			<span
				class="hit"
				bind:this={gripHit}
				style:left="{left}%"
				style:top="{top}%"
				role="slider"
				tabindex="0"
				aria-label={label}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(left)}
				aria-valuetext={valuetext}
				onkeydown={key}
			>
				<span class="grip" data-grip></span>
			</span>
		</div>
	</div>
	<div class="legend">
		<span>{y.unit} senkrecht</span>
		<span>{x.unit} waagerecht</span>
	</div>
</div>

<style>
	.axis-pad {
		display: grid;
		gap: var(--step-1);
	}

	.pad {
		position: relative;
		block-size: var(--axis-pad-height, calc(2 * var(--cell)));
		border: var(--hairline-width) solid var(--hairline);
		touch-action: none;
		cursor: crosshair;
	}

	.axes {
		position: absolute;
		inset: calc(var(--hit) / 2);
		pointer-events: none;
	}

	.cross {
		position: absolute;
		background: var(--hairline);
		pointer-events: none;
	}

	.cross-x {
		inset-inline: 0;
		block-size: var(--hairline-width);
	}

	.cross-y {
		inset-block: 0;
		inline-size: var(--hairline-width);
	}

	.hit {
		position: absolute;
		display: grid;
		place-items: center;
		pointer-events: auto;
		inline-size: var(--hit);
		block-size: var(--hit);
		translate: -50% -50%;
		outline: none;
	}

	.grip {
		inline-size: var(--grip-size);
		block-size: var(--grip-size);
		border: var(--hairline-width) solid var(--grip-border);
		border-radius: 50%;
		background: var(--grip);
	}

	.hit:focus-visible .grip {
		outline: var(--focus-width) solid var(--focus);
		outline-offset: var(--focus-width);
	}

	.legend {
		display: flex;
		justify-content: space-between;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--type-label);
		line-height: var(--line-body);
	}
</style>
