/**
 * Turning a figure about its vertical axis (ui/DESIGN.md §9.3): finger, mouse or keys, snapping
 * to 45°. The figure follows the finger and springs into the nearest detent on release (§4.1:
 * objects spring). No three here; the scene reads `azimuth` each frame.
 */
const DETENT = Math.PI / 4;
const STIFFNESS = 520;
const DAMPING = 46;

export class Orbit {
	azimuth: number;
	private velocity = 0;
	private target: number | null = null;
	private dragging = false;
	private lastX = 0;
	private lastTime = 0;
	private dragDistance = 0;

	constructor(azimuth = DETENT) {
		this.azimuth = azimuth;
	}

	/** True while the figure still turns or springs. */
	get moving(): boolean {
		return this.dragging || this.target !== null;
	}

	/** Pointer travel of the last gesture; a tap stays below a few pixels. */
	get travel(): number {
		return this.dragDistance;
	}

	start(x: number, time: number) {
		this.dragging = true;
		this.target = null;
		this.velocity = 0;
		this.lastX = x;
		this.lastTime = time;
		this.dragDistance = 0;
	}

	move(x: number, time: number, width: number) {
		if (!this.dragging) return;
		const delta = ((x - this.lastX) / Math.max(width, 1)) * Math.PI;
		const dt = Math.max((time - this.lastTime) / 1000, 1e-3);
		this.azimuth -= delta;
		this.velocity = -delta / dt;
		this.dragDistance += Math.abs(x - this.lastX);
		this.lastX = x;
		this.lastTime = time;
	}

	end() {
		if (!this.dragging) return;
		this.dragging = false;
		// The throw carries a little, then the nearest detent holds the figure.
		const projected = this.azimuth + this.velocity * 0.12;
		this.target = Math.round(projected / DETENT) * DETENT;
		this.velocity = 0;
	}

	/** Keys: one detent per press. */
	step(direction: number) {
		const base = this.target ?? Math.round(this.azimuth / DETENT) * DETENT;
		this.target = base + direction * DETENT;
	}

	/** Advances the spring by `dt` seconds; jumps straight to the detent when `instant`. */
	update(dt: number, instant = false) {
		if (this.target === null) return;
		if (instant) {
			this.azimuth = this.target;
			this.target = null;
			return;
		}
		const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
		const h = Math.min(dt, 0.1) / steps;
		for (let index = 0; index < steps; index++) {
			const force = STIFFNESS * (this.target - this.azimuth) - DAMPING * this.velocity;
			this.velocity += force * h;
			this.azimuth += this.velocity * h;
		}
		if (Math.abs(this.target - this.azimuth) < 1e-4 && Math.abs(this.velocity) < 1e-3) {
			this.azimuth = this.target;
			this.target = null;
			this.velocity = 0;
		}
	}

	/** Detent index 0…7 for the readout and the data table. */
	get detent(): number {
		const index = Math.round(this.azimuth / DETENT) % 8;
		return index < 0 ? index + 8 : index;
	}
}
