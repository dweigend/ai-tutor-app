/**
 * The relief of attention (ui/DESIGN.md §9.3): 6 × 6 columns, token × token × weight. The causal
 * mask is a real staircase: the forbidden half lies flat at height 0. The temperature melts the
 * peaks or sharpens them; the columns spring to their new heights. The active row is orange,
 * the learner's own prediction is a yellow cap. Paper columns with ink hairlines, the screen
 * raster on the faces away from the light.
 *
 * Row i (query) runs along three.js z, column j (key) along x.
 */
import { BoxGeometry, EdgesGeometry, Mesh, PlaneGeometry, Vector3, type Raycaster } from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { FigureBase } from './figure-base.js';
import { createRisoSurfaceMaterial, type PrintColour } from './riso-shader.js';
import type { ShaderMaterial } from 'three';

export const RELIEF_SIZE = 6;
const CELL = 0.5;
const FOOT = 0.4;
const HEIGHT = 1.7;
const MIN_HEIGHT = 0.004;

export interface Cell {
	row: number;
	col: number;
}

export interface ReliefSceneOptions {
	canvas: HTMLCanvasElement;
	weights: readonly (readonly number[])[];
	activeRow: number;
	prediction: Cell | null;
	onlost?: () => void;
	/** A tap on a column. */
	onpick?: (cell: Cell) => void;
}

export interface ReliefScene {
	setWeights(weights: readonly (readonly number[])[]): void;
	setActiveRow(row: number): void;
	setPrediction(cell: Cell | null): void;
	turn(direction: number): void;
	setActive(active: boolean): void;
	dispose(): void;
}

function at(index: number): number {
	return (index - (RELIEF_SIZE - 1) / 2) * CELL;
}

export function createReliefScene(options: ReliefSceneOptions): ReliefScene {
	let weights = options.weights;
	let activeRow = options.activeRow;
	let prediction = options.prediction;
	const current: number[][] = weights.map((row) => row.map((value) => value * HEIGHT));
	const velocity: number[][] = weights.map((row) => row.map(() => 0));

	const base = new FigureBase({
		canvas: options.canvas,
		figure: 'relief',
		radius: 2.1,
		center: new Vector3(0, 0.55, 0),
		ground: 'paper',
		onlost: options.onlost,
		ontap: (ray) => pick(ray),
		animate: (_now, dt) => animate(dt)
	});

	const materials: Record<'paper' | 'orange', ShaderMaterial> = {
		paper: base.track(createRisoSurfaceMaterial('paper')),
		orange: base.track(createRisoSurfaceMaterial('orange'))
	};
	const capMaterial = base.track(createRisoSurfaceMaterial('yellow', { raster: false }));
	const box = new BoxGeometry(FOOT, 1, FOOT).translate(0, 0.5, 0);
	const edges = new EdgesGeometry(box);

	const columns: Mesh[][] = [];
	const outlines: LineSegments2[][] = [];
	for (let row = 0; row < RELIEF_SIZE; row++) {
		columns.push([]);
		outlines.push([]);
		for (let col = 0; col < RELIEF_SIZE; col++) {
			const mesh = new Mesh(box, materials.paper);
			mesh.position.set(at(col), 0, at(row));
			mesh.userData = { row, col };
			const lines = base.segments([0, 0, 0, 0, 0, 0]);
			lines.geometry.dispose();
			lines.geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
			lines.position.copy(mesh.position);
			columns[row].push(mesh);
			outlines[row].push(lines);
			base.add(mesh, lines);
		}
	}

	// Floor: the 6 × 6 cells as hairlines; the forbidden half is the flat part of the stair.
	const floor: number[] = [];
	const e = (RELIEF_SIZE / 2) * CELL;
	for (let k = 0; k <= RELIEF_SIZE; k++) {
		const v = -e + k * CELL;
		floor.push(-e, 0, v, e, 0, v, v, 0, -e, v, 0, e);
	}
	base.add(base.segments(floor));

	const cap = new Mesh(new PlaneGeometry(FOOT, FOOT).rotateX(-Math.PI / 2), capMaterial);
	cap.visible = false;
	base.add(cap);

	function colour(row: number): PrintColour {
		return row === activeRow ? 'orange' : 'paper';
	}

	function place() {
		for (let row = 0; row < RELIEF_SIZE; row++) {
			for (let col = 0; col < RELIEF_SIZE; col++) {
				const height = Math.max(current[row][col], MIN_HEIGHT);
				const masked = col > row;
				const mesh = columns[row][col];
				mesh.scale.y = masked ? MIN_HEIGHT : height;
				mesh.visible = !masked;
				mesh.material = materials[colour(row) === 'orange' ? 'orange' : 'paper'];
				outlines[row][col].scale.y = masked ? MIN_HEIGHT : height;
			}
		}
		if (prediction && prediction.col <= prediction.row) {
			const height = Math.max(current[prediction.row][prediction.col], MIN_HEIGHT);
			cap.position.set(at(prediction.col), height + 0.003, at(prediction.row));
			cap.visible = true;
		} else {
			cap.visible = false;
		}
		const still = !base.orbit.moving;
		materials.paper.uniforms.uRaster.value = still ? 1 : 0;
		materials.orange.uniforms.uRaster.value = still ? 1 : 0;
	}

	/** Columns spring to their targets (critically damped, about 250 ms). */
	function animate(dt: number): boolean {
		let moving = false;
		const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
		const h = dt / steps;
		for (let row = 0; row < RELIEF_SIZE; row++) {
			for (let col = 0; col < RELIEF_SIZE; col++) {
				const goal = (weights[row]?.[col] ?? 0) * HEIGHT;
				for (let k = 0; k < steps; k++) {
					const force = 520 * (goal - current[row][col]) - 46 * velocity[row][col];
					velocity[row][col] += force * h;
					current[row][col] += velocity[row][col] * h;
				}
				if (Math.abs(goal - current[row][col]) < 1e-4 && Math.abs(velocity[row][col]) < 1e-3) {
					current[row][col] = goal;
					velocity[row][col] = 0;
				} else {
					moving = true;
				}
			}
		}
		place();
		return moving;
	}

	function pick(ray: Raycaster) {
		const hit = ray.intersectObjects(
			columns.flat().filter((mesh) => mesh.visible),
			false
		)[0];
		if (!hit) return;
		const { row, col } = hit.object.userData as Cell;
		options.onpick?.({ row, col });
	}

	place();
	base.invalidate();

	return {
		setWeights(next) {
			weights = next;
			base.invalidate();
		},
		setActiveRow(row) {
			activeRow = row;
			base.invalidate();
		},
		setPrediction(cell) {
			prediction = cell;
			base.invalidate();
		},
		turn(direction) {
			base.turn(direction);
		},
		setActive(active) {
			base.setActive(active);
		},
		dispose() {
			edges.dispose();
			base.dispose();
		}
	};
}
