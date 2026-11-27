import {
	CylinderGeometry,
	DoubleSide,
	Group,
	PlaneGeometry,
	QuadraticBezierCurve3,
	SphereGeometry,
	TorusGeometry,
	TubeGeometry,
	Vector3
} from 'three';
import { blue, crimson, deckStage, green, ink, orange, solid } from './attention-deck-scene.js';
import {
	computeBackpropDeckState,
	type BackpropDeckParams,
	type BackpropNode,
	type DeckSceneHandle,
	type DeckSceneOptions
} from './index.js';
export {
	computeBackpropDeckState,
	drawBackpropDeckFallback,
	type BackpropDeckParams
} from './index.js';

const nodes: BackpropNode[] = ['a', 'b', 'c', 'mul', 'add', 'loss'];
const symbols = ['a', 'b', 'c', '×', '+', 'L'];
const fields = ['a', 'b', 'c', 'e', 'd', 'L'] as const;
const sites = [
	[-2.25, 0.48, -1.05],
	[-2.25, 0.48, 1],
	[-0.55, 0.48, 1.72],
	[-0.95, 0.48, -0.55],
	[0.55, 0.48, 0.1],
	[2.15, 0.48, 0.1]
].map((v) => new Vector3(...v));
const edges = [
	[0, 3],
	[1, 3],
	[2, 4],
	[3, 4],
	[4, 5],
	[4, 5]
];
const profile = (x: number) => 0.19 * x * x;
function number(value: number) {
	return Number(value.toPrecision(3)).toLocaleString('de-DE');
}

export function createBackpropDeckScene(
	options: DeckSceneOptions<BackpropDeckParams>
): DeckSceneHandle<BackpropDeckParams> {
	let params = { ...options.params },
		state = computeBackpropDeckState(params),
		elapsed = 0;
	const stage = deckStage(options.canvas, 'backprop-deck', options.onlost, animate);
	const graph = new Group(),
		valley = new Group();
	stage.base.add(graph, valley);
	const sphere = new SphereGeometry(1, 24, 16);
	const vertices = nodes.map((node, i) => {
		const mesh = solid(i < 3 ? sphere : new CylinderGeometry(1, 1, 1.2, 6), blue);
		mesh.position.copy(sites[i]);
		const label = stage.label(node, 1.75);
		graph.add(mesh, label.sprite);
		return { mesh, label };
	});
	const links = edges.map(([from, to], i) => {
		const start = sites[from],
			end = sites[to];
		const mid = start.clone().lerp(end, 0.5);
		// The square consumes d twice. Separate its two input slots spatially.
		if (i >= 4) {
			mid.z += i === 4 ? -1.15 : 1.15;
			mid.y += 0.25;
		}
		const path = new QuadraticBezierCurve3(start, mid, end);
		const tube = solid(new TubeGeometry(path, 20, 1, 8, false), ink);
		// Scale the tube radius around its own centreline, preserving the branch shape.
		const pos = tube.geometry.getAttribute('position');
		const original = Float32Array.from(pos.array);
		const centres = Array.from({ length: 21 }, (_, j) => path.getPointAt(j / 20));
		let lastRadius = -1;
		function radius(next: number) {
			if (next === lastRadius) return;
			lastRadius = next;
			for (let k = 0; k < pos.count; k++) {
				const center = centres[Math.floor(k / 9)];
				pos.setXYZ(
					k,
					center.x + (original[k * 3] - center.x) * next,
					center.y + (original[k * 3 + 1] - center.y) * next,
					center.z + (original[k * 3 + 2] - center.z) * next
				);
			}
			pos.needsUpdate = true;
			tube.geometry.computeBoundingSphere();
		}
		const bead = solid(sphere, orange);
		bead.scale.setScalar(0.1);
		graph.add(tube, bead);
		return { tube, bead, path, radius };
	});
	const rings = [0, 1].map(() => {
		const ring = solid(new TorusGeometry(0.33, 0.025, 8, 40), crimson);
		ring.rotation.x = Math.PI / 2;
		graph.add(ring);
		return ring;
	});
	const mergeLabel = stage.label('');
	graph.add(mergeLabel.sprite);
	mergeLabel.sprite.position.copy(sites[4]);
	mergeLabel.sprite.position.y = 1.68;
	const sheet = new PlaneGeometry(4.8, 1.6, 48, 4).rotateX(-Math.PI / 2);
	const pos = sheet.getAttribute('position');
	for (let i = 0; i < pos.count; i++) pos.setY(i, profile(pos.getX(i)));
	sheet.computeVertexNormals();
	const surface = solid(sheet, '#ded8cb');
	surface.material.side = DoubleSide;
	const lines: number[] = [];
	for (let j = -2; j <= 2; j++) {
		for (let i = -24; i < 24; i++)
			lines.push(
				i / 10,
				profile(i / 10) + 0.009,
				j * 0.38,
				(i + 1) / 10,
				profile((i + 1) / 10) + 0.009,
				j * 0.38
			);
	}
	for (let i = -6; i <= 6; i++)
		lines.push(i * 0.4, profile(i * 0.4) + 0.009, -0.8, i * 0.4, profile(i * 0.4) + 0.009, 0.8);
	const ball = solid(sphere, orange);
	ball.scale.setScalar(0.15);
	const foot = stage.label('d = 0'),
		readout = stage.label('', 1.9);
	foot.sprite.position.set(0, 0.1, 1.18);
	valley.add(surface, stage.base.segments(lines), ball, foot.sprite, readout.sprite);
	function animate(now: number, dt: number): boolean {
		elapsed += dt;
		const { slide, values, gradients } = state;
		stage.frame(slide === 3 ? 1.15 : 1.05, slide === 4 ? 0.42 : 0.63);
		graph.visible = slide !== 4;
		valley.visible = !graph.visible;
		if (slide === 4) {
			const step = Math.min(state.descent.length - 1, elapsed * 1.35);
			const i = Math.floor(step),
				t = step - i,
				smooth = t * t * (3 - 2 * t);
			const d =
				state.descent[i] + ((state.descent[i + 1] ?? state.descent[i]) - state.descent[i]) * smooth;
			const x = (2.25 * d) / Math.max(1, Math.abs(values.d));
			const p = stage.feedback('loss', now);
			ball.position.set(x + (p?.shake ?? 0), profile(x) + 0.15, 0);
			ball.material.color.set(p?.color ?? orange);
			readout.sprite.position.copy(ball.position);
			readout.sprite.position.y += 0.44;
			readout.set('L = ' + number(d * d));
			return step < state.descent.length - 1;
		}
		const transit = (elapsed * 0.65) % 3.35;
		const backward = slide === 2 || slide === 3;
		const derivatives = [state.b, state.a, 1, 1, values.d, values.d];
		links.forEach(({ tube, bead, path, radius }, i) => {
			const branch = i >= 4,
				active = slide !== 0 && (slide !== 3 || branch);
			const depth = [0, 0, 1, 1, 2, 2][i],
				time = transit - (backward ? 2 - depth : depth);
			const travelling = active && time >= 0 && time <= 1;
			tube.material.color.set(active ? (backward ? crimson : blue) : '#615e58');
			radius(0.022 + (backward && active ? 0.016 * Math.min(4, Math.abs(derivatives[i])) : 0));
			bead.visible = travelling;
			if (travelling) {
				path.getPointAt(backward ? 1 - time : time, bead.position);
				bead.material.color.set(backward ? crimson : orange);
			}
		});
		vertices.forEach(({ mesh, label }, i) => {
			const node = nodes[i],
				v = values[fields[i]],
				p = stage.feedback(node, now);
			const selected = state.highlightNode === node;
			mesh.material.color.set(p?.color ?? (selected ? orange : i === 5 ? crimson : blue));
			const size =
				(0.2 + (slide === 1 ? 0.06 * Math.log1p(Math.min(20, Math.abs(v))) : 0.045)) *
				(1 + (p?.wave ?? 0) * 0.35 + (selected ? 0.22 : 0));
			mesh.scale.setScalar(size);
			mesh.position.x = sites[i].x + (p?.shake ?? 0);
			label.sprite.position.copy(mesh.position);
			label.sprite.position.y += size + 0.23;
			label.set(
				slide === 2
					? '∂L/∂' + fields[i] + '  ' + number(gradients[fields[i]])
					: symbols[i] + '  ' + number(v)
			);
		});
		rings.forEach((ring, i) => {
			ring.visible = slide === 3 && transit >= 1 && transit < 2.5;
			if (!ring.visible) return;
			ring.position.copy(sites[4]);
			ring.position.y += 0.02 + i * 0.09;
			ring.scale.setScalar(1 + (transit - 1) * (0.55 + 0.28 * i));
		});
		mergeLabel.sprite.visible = slide === 3;
		mergeLabel.set(number(values.d) + ' + ' + number(values.d) + ' = ' + number(gradients.d));
		return slide !== 0;
	}
	return {
		update(partial) {
			const previous = state;
			params = { ...params, ...partial };
			state = computeBackpropDeckState(params);
			if (
				state.slide !== previous.slide ||
				state.lr !== previous.lr ||
				state.values.d !== previous.values.d
			)
				elapsed = 0;
			stage.base.invalidate();
		},
		pulseCorrect: (target) => stage.pulse(green, target),
		pulseError: (target) => stage.pulse(crimson, target),
		resize: () => stage.base.resize(),
		dispose: () => stage.dispose()
	};
}
