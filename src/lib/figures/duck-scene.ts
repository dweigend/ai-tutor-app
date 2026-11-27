import {
	AnimationClip,
	AnimationMixer,
	AnimationUtils,
	Box3,
	Euler,
	LoopOnce,
	MathUtils,
	PerspectiveCamera,
	Quaternion,
	Raycaster,
	Scene,
	SkinnedMesh,
	Sphere,
	Vector2,
	Vector3,
	WebGLRenderer,
	type AnimationAction,
	type BufferGeometry,
	type Material,
	type MeshStandardMaterial,
	type Skeleton,
	type Texture
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { duckClip, type DuckClip, type DuckPose } from './index.js';
import {
	createDuckInk,
	createDuckOutline,
	duckOutlineWidth,
	isMiniDuck,
	setHullNormals
} from './duck-halftone-shader.js';
import {
	ACCESSORIES,
	accessoriesFor,
	type DuckAccessory,
	type DuckWardrobe
} from './duck-wardrobe.js';
import {
	FigureLoop,
	countRender,
	duckFps,
	hasFigureLayout,
	pixelRatioCap,
	registerScene
} from './renderer.js';

export type DuckZone = 'belly' | 'head' | 'beak';
export type DuckFailure = {
	phase: 'load' | 'model' | 'renderer' | 'frame' | 'context';
	reason: string;
};
export interface DuckSceneOptions {
	canvas: HTMLCanvasElement;
	url: string;
	fps?: 12 | 24;
	figure?: string;
	isCancelled?: () => boolean;
	onlost?: () => void;
	ondone?: (pose: DuckPose) => void;
	onfirstframe?: () => void;
	onerror?: (failure: DuckFailure) => void;
	ontickle?: (zone: DuckZone) => void;
}
export interface DuckScene {
	readonly pose: DuckPose;
	play(pose: DuckPose): void;
	poke(): void;
	setActive(active: boolean): void;
	resize(): void;
	dispose(): void;
	setWardrobe(value: Partial<DuckWardrobe>): void;
	setSpeechLevel(value: number): void;
	pulseSyllable(): void;
	setInteractive(value: boolean): void;
}

/** Fit a box enclosing every yaw, allowing for its nearest face and both fields of view. */
export function duckCameraDistance(
	width: number,
	height: number,
	depth: number,
	aspect: number,
	fov = 32
) {
	const tangent = Math.tan(MathUtils.degToRad(fov) / 2);
	return depth / 2 + (1.08 * Math.max(height, width / aspect)) / (2 * tangent);
}

export async function createDuckScene(options: DuckSceneOptions): Promise<DuckScene | undefined> {
	const { canvas, figure = 'duck' } = options;
	const gltf = await new GLTFLoader().loadAsync(options.url);
	const model = gltf.scene,
		scene = new Scene();
	scene.add(model);
	const geometries = new Set<BufferGeometry>(),
		materials = new Set<Material>(),
		textures = new Set<Texture>(),
		skeletons = new Set<Skeleton>();
	const meshes: SkinnedMesh[] = [];
	model.traverse((object) => {
		if (!(object instanceof SkinnedMesh)) return;
		meshes.push(object);
		geometries.add(object.geometry);
		skeletons.add(object.skeleton);
		const material = object.material as MeshStandardMaterial;
		materials.add(material);
		if (material.map) textures.add(material.map);
	});
	const cleanup: (() => void)[] = [];
	function dispose() {
		while (cleanup.length) cleanup.pop()!();
		for (const group of [geometries, materials, textures, skeletons]) {
			for (const item of group) item.dispose();
			group.clear();
		}
		for (const image of images) image.close();
		images.clear();
	}
	const images = new Set<ImageBitmap>();
	for (const texture of textures)
		if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap)
			images.add(texture.image);
	if (options.isCancelled?.()) {
		dispose();
		return;
	}
	let phase: DuckFailure['phase'] = 'model';
	try {
		const bone = (name: string) => {
			const node = model.getObjectByName(name);
			if (!node) throw new Error('Missing duck rig node ' + name);
			return node;
		};
		const head = bone('head'),
			eyes = [bone('eye_l'), bone('eye_r')],
			tip = bone('beanie_tip'),
			jaws = [bone('jaw_lower'), bone('jaw_upper')];
		const accessories = (Object.keys(ACCESSORIES) as DuckAccessory[]).map((key) => ({
			key,
			node: bone(ACCESSORIES[key]),
			bounds: new Box3().setFromObject(bone(ACCESSORIES[key]), true)
		}));
		const bodyBounds = new Box3().setFromObject(bone('duck_body'), true);
		if (bodyBounds.isEmpty() || !meshes.length) throw new Error('Empty duck geometry');
		let height = 0,
			diameter = 0;
		const target = new Vector3();
		const camera = new PerspectiveCamera(32, 1, 0.1, 1000);
		const direction = new Vector3(6.35, 1.6, 4.95).normalize();
		const viewport = new Vector2(1, 1);
		phase = 'renderer';
		const renderer = new WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			powerPreference: 'low-power'
		});
		cleanup.push(() => {
			renderer.dispose();
			renderer.forceContextLoss();
		});
		renderer.debug.onShaderError = () => {
			throw new Error('Duck shader failed to link');
		};
		renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, pixelRatioCap()));
		const outline = createDuckOutline(viewport);
		materials.add(outline);
		/** Ink hulls of the glasses: dropped at corner size, where they would fill the lenses. */
		const glassesHulls: SkinnedMesh[] = [];
		for (const mesh of meshes) {
			// GLTFLoader names the primitive after its glTF mesh, the accessory group after its node.
			const owner =
				accessories.find(({ node }) => node === mesh || node.getObjectById(mesh.id))?.node.name ??
				'duck_body';
			const ink = createDuckInk(
				mesh.material as MeshStandardMaterial,
				owner,
				renderer.getPixelRatio()
			);
			mesh.material = ink;
			materials.add(ink);
			mesh.frustumCulled = false;
			setHullNormals(mesh.geometry);
			const hull = mesh.clone(false);
			hull.name = mesh.name + '_outline';
			hull.material = outline;
			// Single-primitive accessories may themselves be the wardrobe toggle.
			mesh.add(hull);
			hull.position.set(0, 0, 0);
			hull.quaternion.identity();
			hull.scale.setScalar(1);
			if (owner === ACCESSORIES.glasses) glassesHulls.push(hull);
		}
		let wake = () => {};
		function setWardrobe(value: Partial<DuckWardrobe>) {
			const box = bodyBounds.clone(),
				shown = accessoriesFor(value);
			for (const { key, node, bounds } of accessories) {
				node.visible = shown[key];
				if (node.visible) box.union(bounds);
			}
			const size = box.getSize(new Vector3());
			// The widest wing spread and the highest jump occur during celebrate.
			diameter = Math.max(size.x, size.z) * 1.12;
			height = size.y + 0.8;
			box.getCenter(target);
			resize();
			wake();
		}
		setWardrobe({});
		const mixer = new AnimationMixer(model);
		cleanup.push(() => {
			mixer.stopAllAction();
			mixer.uncacheRoot(model);
		});
		const clips = new Map(gltf.animations.map((c) => [c.name, c]));
		const speak = clips.get('speak')!;
		const mouthClip = AnimationUtils.makeClipAdditive(
			new AnimationClip(
				'mouth',
				speak.duration,
				speak.tracks.filter((t) => /^jaw_(upper|lower)\./.test(t.name)).map((t) => t.clone())
			)
		);
		const mouth = mixer.clipAction(mouthClip);
		let current: AnimationAction | undefined,
			pose: DuckPose = 'wait';
		function playBase(name: Exclude<DuckClip, 'speak'>) {
			const clip = clips.get(name);
			if (!clip) throw new Error('Missing clip ' + name);
			const action = mixer.clipAction(clip);
			const once = ['nod', 'giggle', 'shake', 'celebrate', 'look_around'].includes(name);
			if (once || current !== action || !action.isRunning()) {
				action.reset().play();
				if (once) {
					action.setLoop(LoopOnce, 1);
					action.clampWhenFinished = true;
				}
				if (current && current !== action) current.crossFadeTo(action, 0.2, false);
				current = action;
			}
		}
		function play(next: DuckPose) {
			wake();
			const name = duckClip(next);
			if (name === 'speak') {
				if (!current) playBase('idle');
				mouth.reset().fadeIn(0.18).play();
			} else {
				mouth.fadeOut(0.18);
				playBase(name);
			}
			pose = next;
		}
		mixer.addEventListener('loop', ({ action }) => {
			if (action === current && pose === 'wait') {
				action.time = 0;
				action.paused = true;
			}
		});
		mixer.addEventListener('finished', ({ action }) => {
			if (action !== current) return;
			if (pose === 'speak') {
				playBase('idle');
				return;
			}
			const ended = pose;
			play('wait');
			options.ondone?.(ended);
		});
		play('wait');
		const zones = [
			{ zone: 'beak', bone: jaws[0], offset: new Vector3(0, 0.08, 0.52), radius: 0.34 },
			{ zone: 'head', bone: head, offset: new Vector3(0, 0.53, 0.06), radius: 0.68 },
			{ zone: 'belly', bone: bone('body'), offset: new Vector3(0, 0.47, 0), radius: 0.91 }
		] as const;
		const raycaster = new Raycaster(),
			sphere = new Sphere(),
			point = new Vector3(),
			pointer = new Vector2();
		let interactive = true,
			held: number | null = null,
			startX = 0,
			startY = 0,
			startYaw = 0,
			dragged = false,
			lastTickle = -Infinity;
		let desiredYaw = 0,
			yaw = 0,
			velocity = 0,
			sway = 0,
			swaySpeed = 0,
			gazeX = 0,
			gazeY = 0;
		let level = 0,
			envelope = 0,
			pulseEnd = 0;
		function locate(event: PointerEvent) {
			wake();
			const rect = canvas.getBoundingClientRect();
			pointer.set(
				MathUtils.clamp((2 * (event.clientX - rect.left)) / rect.width - 1, -1, 1),
				MathUtils.clamp(1 - (2 * (event.clientY - rect.top)) / rect.height, -1, 1)
			);
		}
		const listeners = new AbortController();
		cleanup.push(() => listeners.abort());
		const eventOptions = { signal: listeners.signal };
		canvas.addEventListener(
			'pointerdown',
			(e) => {
				if (!interactive || held !== null || e.button !== 0) return;
				held = e.pointerId;
				startX = e.clientX;
				startY = e.clientY;
				startYaw = desiredYaw;
				dragged = false;
				locate(e);
				canvas.setPointerCapture(held);
			},
			eventOptions
		);
		canvas.addEventListener(
			'pointermove',
			(e) => {
				if (!interactive) return;
				locate(e);
				if (held !== e.pointerId) return;
				dragged ||= Math.hypot(e.clientX - startX, e.clientY - startY) > 5;
				if (dragged) desiredYaw = startYaw + ((e.clientX - startX) * 5) / canvas.clientWidth;
			},
			eventOptions
		);
		canvas.addEventListener(
			'pointerleave',
			() => {
				pointer.set(0, 0);
				wake();
			},
			eventOptions
		);
		canvas.addEventListener(
			'lostpointercapture',
			() => {
				held = null;
			},
			eventOptions
		);
		canvas.addEventListener(
			'pointerup',
			(e) => {
				if (!interactive || held !== e.pointerId) return;
				held = null;
				if (dragged) return;
				locate(e);
				raycaster.setFromCamera(pointer, camera);
				let hit: DuckZone | undefined,
					best = Infinity;
				for (const z of zones) {
					z.bone.localToWorld(sphere.center.copy(z.offset));
					sphere.radius = z.radius;
					if (!raycaster.ray.intersectSphere(sphere, point)) continue;
					const distance = point.distanceTo(raycaster.ray.origin);
					if (distance < best) {
						hit = z.zone;
						best = distance;
					}
				}
				if (!hit) return;
				if (hit === 'belly') {
					if (performance.now() - lastTickle < 1200) return;
					lastTickle = performance.now();
					play('giggle');
				}
				if (hit === 'head') play('nod');
				if (hit === 'beak') pulseSyllable();
				options.ontickle?.(hit);
			},
			eventOptions
		);
		function pulseSyllable() {
			wake();
			pulseEnd = performance.now() + 85;
		}
		function resize() {
			if (!hasFigureLayout(canvas)) return;
			const { clientWidth: w, clientHeight: h } = canvas;
			if (viewport.x !== w || viewport.y !== h) {
				viewport.set(w, h);
				renderer.setSize(w, h, false);
				// The ink line follows the canvas size, so the 72 px corner duck stays as crisp as
				// the fullscreen one instead of growing a fixed contour over its small shapes.
				outline.uniforms.outlineWidth.value = duckOutlineWidth(w, h);
				const mini = isMiniDuck(w, h);
				for (const hull of glassesHulls) hull.visible = !mini;
			}
			camera.aspect = w / h;
			const distance = duckCameraDistance(
				diameter,
				height + diameter * 0.12,
				diameter,
				camera.aspect
			);
			camera.position.copy(target).addScaledVector(direction, distance);
			camera.lookAt(target);
			camera.updateProjectionMatrix();
		}
		const animated = [head, ...eyes, tip, ...jaws],
			base = animated.map((b) => b.quaternion.clone());
		const rotation = new Quaternion(),
			euler = new Euler();
		const offset = (i: number, x: number, y: number, z: number) =>
			animated[i].quaternion.multiply(rotation.setFromEuler(euler.set(x, y, z)));
		let first = true,
			last = 0;
		const restingInterval = 1000 / duckFps(options.fps ?? 24);
		function hasMotion(now: number) {
			const goal = Math.max(level, now < pulseEnd ? 1 : 0);
			return (
				held !== null ||
				Math.abs(desiredYaw - yaw) + Math.abs(velocity) + Math.abs(sway) + Math.abs(swaySpeed) >
					0.001 ||
				Math.abs(pointer.x - gazeX) + Math.abs(pointer.y - gazeY) > 0.001 ||
				now < pulseEnd ||
				Math.abs(goal - envelope) > 0.001
			);
		}
		function frame(now: number) {
			if (!hasFigureLayout(canvas)) return false;
			try {
				if (
					!first &&
					(pose === 'wait' || pose === 'idle') &&
					!hasMotion(now) &&
					now - last < restingInterval - 1
				)
					return true;
				const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000));
				const dt = Math.min(0.032, elapsed);
				last = now;
				animated.forEach((b, i) => b.quaternion.copy(base[i]));
				mixer.update(elapsed);
				animated.forEach((b, i) => base[i].copy(b.quaternion));
				velocity += ((desiredYaw - yaw) * 95 - velocity * 15) * dt;
				yaw += velocity * dt;
				model.rotation.y = yaw;
				swaySpeed += (-velocity * 0.8 - sway * 50 - swaySpeed * 9) * dt;
				sway += swaySpeed * dt;
				gazeX = MathUtils.damp(gazeX, pointer.x, 9, dt);
				gazeY = MathUtils.damp(gazeY, pointer.y, 9, dt);
				offset(0, -gazeY * 0.09, gazeX * 0.19, 0);
				for (const i of [1, 2]) offset(i, -gazeY * 0.03, gazeX * 0.04, 0);
				offset(3, 0, 0, MathUtils.clamp(sway, -0.24, 0.24));
				const goal = Math.max(level, now < pulseEnd ? 1 : 0);
				envelope = MathUtils.damp(envelope, goal, goal > envelope ? 50 : 1 / 0.09, dt);
				offset(4, envelope * 0.32, 0, 0);
				offset(5, -envelope * 0.045, 0, 0);
				renderer.render(scene, camera);
				if (renderer.getContext().isContextLost()) return false;
				countRender(figure);
				if (first) {
					first = false;
					options.onfirstframe?.();
				}
				return pose !== 'wait' || !current?.paused || hasMotion(now);
			} catch (error) {
				options.onerror?.({ phase: 'frame', reason: String(error) });
				return false;
			}
		}
		const loop = new FigureLoop({ element: canvas, frame });
		wake = () => loop.wake();
		cleanup.push(() => loop.dispose());
		canvas.addEventListener(
			'webglcontextlost',
			(e) => {
				e.preventDefault();
				loop.setActive(false);
				options.onerror?.({ phase: 'context', reason: 'webglcontextlost' });
				options.onlost?.();
			},
			eventOptions
		);
		const observer = new ResizeObserver(() => {
			resize();
			loop.wake();
		});
		observer.observe(canvas);
		cleanup.push(() => observer.disconnect());
		resize();
		loop.wake();
		const api: DuckScene = {
			get pose() {
				return pose;
			},
			play,
			poke: () => play('giggle'),
			resize,
			dispose,
			setWardrobe,
			pulseSyllable,
			setInteractive(value) {
				interactive = value;
				if (!value) {
					held = null;
					pointer.set(0, 0);
				}
			},
			setActive(value) {
				loop.setActive(value);
				if (value) loop.wake();
			},
			setSpeechLevel(value) {
				wake();
				level = Number.isFinite(value) ? MathUtils.clamp(value, 0, 1) : 0;
			}
		};
		registerScene(figure, { scene: api });
		return api;
	} catch (error) {
		dispose();
		throw Object.assign(new Error(String(error)), { phase });
	}
}
