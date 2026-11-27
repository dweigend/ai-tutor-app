import {
	BoxGeometry,
	CanvasTexture,
	CylinderGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	MeshLambertMaterial,
	SphereGeometry,
	Sprite,
	SpriteMaterial,
	SRGBColorSpace,
	Vector3,
	type BufferGeometry
} from 'three';
import { FigureBase } from './figure-base.js';
import {
	computeAttentionDeckState,
	type AttentionDeckParams,
	type AttentionTerm,
	type DeckSceneOptions,
	type DeckSceneHandle
} from './index.js';
export {
	computeAttentionDeckState,
	drawAttentionDeckFallback,
	type AttentionDeckParams
} from './index.js';

export const ink = '#0a0a0a',
	blue = '#1f56d8',
	orange = '#e85d1a',
	crimson = '#b81444',
	green = '#22c55e';
const up = new Vector3(0, 1, 0);
export function solid(geometry: BufferGeometry, color: string) {
	return new Mesh(geometry, new MeshLambertMaterial({ color }));
}
export function connect(
	mesh: ReturnType<typeof solid>,
	start: Vector3,
	end: Vector3,
	width: number
) {
	mesh.position.addVectors(start, end).multiplyScalar(0.5);
	const direction = mesh.scale.subVectors(end, start);
	const length = direction.length();
	if (length > 0) mesh.quaternion.setFromUnitVectors(up, direction.normalize());
	mesh.scale.set(width, length, width);
}

/** Shared paper stage. Keep the user's orbit offset while easing the camera framing. */
export function deckStage(
	canvas: HTMLCanvasElement,
	figure: string,
	onlost: (() => void) | undefined,
	animate: (now: number, dt: number) => boolean
) {
	const center = new Vector3(0, 0.58, 0);
	const base: FigureBase = new FigureBase({
		canvas,
		figure,
		center,
		radius: 3.05,
		ground: 'paper',
		onlost,
		animate: (now, dt): boolean => {
			const moving = animate(now, dt);
			const framing = Math.abs(zoom - base.camera.zoom) + Math.abs(height - center.y) > 0.0001;
			const blend = 1 - Math.exp(-6 * dt);
			base.camera.zoom += (zoom - base.camera.zoom) * blend;
			base.camera.updateProjectionMatrix();
			center.y += (height - center.y) * blend;
			const pulsing = feedback !== null;
			if (feedback && now - feedback.start >= 600) feedback = null;
			return moving || framing || pulsing;
		}
	});
	let zoom = 1,
		height = 0.58;
	base.orbit.azimuth = 0.14;
	base.renderer.setClearColor('#f4f1ea');
	const light = new DirectionalLight(0xffffff, 1.65);
	light.position.set(-4, 8, 5);
	base.add(new HemisphereLight(0xffffff, 0xe3d6c5, 1.65), light);
	const grid: number[] = [];
	for (let i = -3; i <= 3; i++) grid.push(i, -0.1, -2, i, -0.1, 2);
	for (let i = -2; i <= 2; i++) grid.push(-3, -0.1, i, 3, -0.1, i);
	const floor = base.segments(grid);
	floor.material.transparent = true;
	floor.material.opacity = 0.18;
	base.add(floor);
	const textures: CanvasTexture[] = [];
	const oldTouchAction = canvas.style.touchAction;
	canvas.style.touchAction = 'pan-y';
	function label(initial: string, width = 1.15) {
		const sheet = document.createElement('canvas');
		sheet.width = 256;
		sheet.height = 64;
		const ctx = sheet.getContext('2d')!;
		const map = new CanvasTexture(sheet);
		map.colorSpace = SRGBColorSpace;
		textures.push(map);
		const sprite = new Sprite(new SpriteMaterial({ map, depthTest: false, toneMapped: false }));
		sprite.renderOrder = 3;
		sprite.scale.set(width, width / 4, 1);
		let previous = '';
		function set(value: string) {
			if (value === previous) return;
			previous = value;
			ctx.clearRect(0, 0, 256, 64);
			ctx.font = '600 44px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			const w = Math.min(254, ctx.measureText(value).width + 16);
			ctx.fillStyle = '#f4f1ea';
			ctx.fillRect((256 - w) / 2, 5, w, 54);
			ctx.fillStyle = ink;
			ctx.fillText(value, 128, 32, 242);
			map.needsUpdate = true;
		}
		set(initial);
		return { sprite, set };
	}
	let feedback: { target?: string; color: string; start: number } | null = null;
	return {
		base,
		label,
		frame(nextZoom: number, nextHeight: number) {
			// Lift the subject into the visual centre below the slide heading on tall plates.
			const portrait = Math.max(0, 1 - base.camera.right / base.camera.top);
			zoom = nextZoom * (1 + 0.08 * portrait);
			height = nextHeight - portrait * 1.25;
		},
		pulse(color: string, target?: string) {
			feedback = { color, target, start: performance.now() };
			base.invalidate();
		},
		feedback(target: string, now: number) {
			if (!feedback || (feedback.target && feedback.target !== target)) return null;
			const age = (now - feedback.start) / 600;
			if (age < 0 || age >= 1) return null;
			return {
				color: feedback.color,
				wave: Math.sin(age * Math.PI),
				shake: feedback.color === crimson ? Math.sin(age * Math.PI * 6) * (1 - age) * 0.13 : 0
			};
		},
		dispose() {
			canvas.style.touchAction = oldTouchAction;
			textures.forEach((t) => t.dispose());
			base.dispose();
		}
	};
}
export function createAttentionDeckScene(
	options: DeckSceneOptions<AttentionDeckParams>
): DeckSceneHandle<AttentionDeckParams> {
	let params = { ...options.params };
	let s = computeAttentionDeckState(params);
	const stage = deckStage(options.canvas, 'attention-deck', options.onlost, animate);
	const box = new BoxGeometry(0.44, 1, 0.44).translate(0, 0.5, 0);
	const tube = new CylinderGeometry(1, 1, 1, 12);
	const bead = new SphereGeometry(0.085, 16, 12);
	const source = solid(new CylinderGeometry(0.24, 0.32, 0.48, 6), blue);
	const originLabel = stage.label('Q');
	stage.base.add(source, originLabel.sprite);
	const columns = Array.from({ length: 4 }, (_, i) => {
		const column = solid(box, blue),
			line = solid(tube, orange),
			packet = solid(new BoxGeometry(0.2, 0.2, 0.2), orange);
		column.position.set((i - 1.5) * 1.25, 0, -0.35);
		const label = stage.label('T' + (i + 1), 1.45);
		stage.base.add(column, line, packet, label.sprite);
		return { column, line, packet, label };
	});
	const terms: AttentionTerm[] = ['Q', 'K', 'dk', 'softmax', 'V'];
	const badges = terms.map((term, i) => {
		const group = new Group(),
			mark = solid(bead, blue),
			label = stage.label(term === 'dk' ? '√dₖ' : term);
		group.position.set((i - 2) * 1.08, 0.1, 1.85);
		label.sprite.position.y = 0.31;
		group.add(mark, label.sprite);
		stage.base.add(group);
		return { term, group, mark };
	});
	const end = new Vector3();
	const result = s.context.map((_, i) => {
		const mesh = solid(box, [blue, orange, crimson][i]);
		stage.base.add(mesh);
		return mesh;
	});
	function paint(term: AttentionTerm, color: string, now: number) {
		return (
			stage.feedback(term, now)?.color ??
			(s.matchedTerms.includes(term) ? green : s.highlightTerm === term ? crimson : color)
		);
	}
	function animate(now: number, dt: number): boolean {
		let settling = false;
		const { slide } = s;
		stage.frame([1.03, 1, 1.13, 1.15, 0.98][slide], slide === 4 ? 0.75 : 0.58);
		const flow = slide === 1 || slide === 4;
		source.visible = slide === 1;
		originLabel.sprite.visible = flow;
		source.position.set(slide === 1 ? columns[s.focusToken].column.position.x : 0, 0.6, 1.02);
		originLabel.sprite.position.copy(source.position);
		originLabel.sprite.position.y = slide === 1 ? 1.1 : 1.38;
		originLabel.set(slide === 1 ? 'Q' + (s.focusToken + 1) : 'Σ αᵢVᵢ');
		source.material.color.set(paint('Q', blue, now));
		const term: AttentionTerm = (['K', 'K', 'dk', 'softmax', 'V'] as const)[slide];
		columns.forEach(({ column, line, packet, label }, i) => {
			const p = stage.feedback(term, now);
			const h = [
				0.76 + 0.19 * i,
				0.82 + s.rawScores[i] * 0.09,
				s.logits[i] * 0.43,
				s.weights[i] * 2.6,
				s.weights[i] * 1.7
			][slide];
			settling ||= Math.abs(Math.max(0.018, h) - column.scale.y) > 0.001;
			column.scale.y += (Math.max(0.018, h) - column.scale.y) * (1 - Math.exp(-10 * dt));
			column.scale.x = 1 + (p?.wave ?? 0) * 0.23;
			column.position.y =
				(slide === 0 ? 0.16 + 0.08 * Math.sin(now * 0.0016 + i) : 0) + (p?.shake ?? 0);
			column.rotation.z = slide === 0 ? (i - 1.5) * 0.11 : 0;
			column.material.color.set(
				paint(term, i === s.focusToken && slide !== 1 ? blue : orange, now)
			);
			label.sprite.position.copy(column.position);
			label.sprite.position.y += column.scale.y + 0.24;
			label.set(
				[
					'T' + (i + 1),
					'K' + (i + 1),
					String(s.logits[i]),
					Math.round(100 * s.weights[i]) + '%',
					'V' + (i + 1)
				][slide]
			);
			line.visible = packet.visible = flow;
			if (!flow) return;
			end.copy(column.position);
			end.y += column.scale.y * 0.67;
			connect(
				line,
				source.position,
				end,
				0.009 + 0.047 * (slide === 1 ? s.rawScores[i] / 6 : s.weights[i])
			);
			line.material.color.set(paint(slide === 1 ? 'Q' : 'V', slide === 1 ? blue : orange, now));
			const t = (now * 0.00065) % 1;
			packet.position.lerpVectors(source.position, end, slide === 1 ? t : 1 - t);
			packet.scale.setScalar(slide === 1 ? 0.65 : 0.45 + 1.35 * s.weights[i]);
		});
		result.forEach((mesh, i) => {
			mesh.visible = slide === 4;
			mesh.position.set((i - 1) * 0.28, 0, 1.02);
			mesh.scale.set(0.6, 1.4 * s.context[i], 0.6);
			mesh.material.color.set(paint('V', [blue, orange, crimson][i], now));
		});
		badges.forEach(({ term, group, mark }) => {
			group.visible = slide === 4;
			const p = stage.feedback(term, now);
			mark.material.color.set(paint(term, ink, now));
			mark.scale.setScalar(s.highlightTerm === term ? 1.9 : 1 + (p?.wave ?? 0));
			mark.position.x = p?.shake ?? 0;
		});
		return slide === 0 || flow || settling;
	}
	return {
		update(partial) {
			params = { ...params, ...partial };
			s = computeAttentionDeckState(params);
			stage.base.invalidate();
		},
		pulseCorrect: (target) => stage.pulse(green, target),
		pulseError: (target) => stage.pulse(crimson, target),
		resize: () => stage.base.resize(),
		dispose: () => stage.dispose()
	};
}
