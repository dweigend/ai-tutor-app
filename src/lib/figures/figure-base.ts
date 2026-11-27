/**
 * Shared stage of the mathematical figures (valley, relief): orthographic camera on a fixed
 * elevation, turned about the vertical axis by an Orbit, 1-px hairlines (Line2 / LineMaterial
 * in CSS pixels, not scaling with the zoom), the pause-aware frame loop and tap picking.
 */
import {
	Color,
	OrthographicCamera,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	type Object3D,
	type ShaderMaterial,
	type WebGLRenderer
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { Orbit } from './orbit.js';
import { FIGURE_FPS } from './poses.js';
import { countRender, createRenderer, FigureLoop } from './renderer.js';
import { cssColour, PRINT, type PrintColour } from './riso-shader.js';

const ELEVATION = (32 * Math.PI) / 180;

export interface FigureBaseOptions {
	canvas: HTMLCanvasElement;
	/** Render counter name for the browser proofs. */
	figure: string;
	/** Half the width of the square the camera frames, in scene units. */
	radius: number;
	/** Point the camera looks at. */
	center: Vector3;
	/** Background print colour of the plate. */
	ground: PrintColour;
	onlost?: () => void;
	/** A tap (no drag) on the figure, with the objects it hit. */
	ontap?: (ray: Raycaster) => void;
	/**
	 * Called every frame the loop runs: true while something moves at full rate, 'idle' for the
	 * calm 12-fps idle (§9.3c), false when the figure stands.
	 */
	animate: (now: number, dt: number) => boolean | 'idle';
}

export class FigureBase {
	readonly scene = new Scene();
	readonly camera: OrthographicCamera;
	readonly renderer: WebGLRenderer;
	readonly orbit = new Orbit();
	readonly loop: FigureLoop;
	private readonly lineMaterials = new Set<LineMaterial>();
	private readonly risoMaterials = new Set<ShaderMaterial>();
	private readonly options: FigureBaseOptions;
	private readonly resizeObserver: ResizeObserver | null;
	private lastNow = 0;
	private lastRender = 0;
	private dirty = true;
	private disposed = false;

	constructor(options: FigureBaseOptions) {
		this.options = options;
		const { canvas } = options;
		this.renderer = createRenderer(canvas);
		const [r, g, b] = PRINT[options.ground];
		this.renderer.setClearColor(new Color().setRGB(r / 255, g / 255, b / 255), 1);
		this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
		this.loop = new FigureLoop({ element: canvas, frame: (now) => this.frame(now) });
		canvas.addEventListener('webglcontextlost', this.onLost);
		canvas.addEventListener('pointerdown', this.onDown);
		canvas.addEventListener('pointermove', this.onMove);
		canvas.addEventListener('pointerup', this.onUp);
		canvas.addEventListener('pointercancel', this.onUp);
		this.resizeObserver =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
		this.resizeObserver?.observe(canvas);
		this.resize();
	}

	get pixelRatio(): number {
		return this.renderer.getPixelRatio();
	}

	/** A 1-px hairline set of segments (pairs of points) in one print colour. */
	segments(points: readonly number[], colour: PrintColour = 'ink'): LineSegments2 {
		const geometry = new LineSegmentsGeometry();
		geometry.setPositions(points as number[]);
		const material = new LineMaterial({
			color: cssColour(colour),
			linewidth: 1,
			worldUnits: false,
			toneMapped: false
		});
		material.resolution.set(this.options.canvas.clientWidth, this.options.canvas.clientHeight);
		this.lineMaterials.add(material);
		const lines = new LineSegments2(geometry, material);
		lines.frustumCulled = false;
		return lines;
	}

	setSegments(lines: LineSegments2, points: readonly number[]) {
		lines.geometry.dispose();
		const geometry = new LineSegmentsGeometry();
		geometry.setPositions(points as number[]);
		lines.geometry = geometry;
	}

	setLineColour(lines: LineSegments2, colour: PrintColour) {
		lines.material.color.set(cssColour(colour));
	}

	/** Registers a riso material so its raster follows the pixel ratio. */
	track(material: ShaderMaterial): ShaderMaterial {
		material.uniforms.uDpr.value = this.pixelRatio;
		this.risoMaterials.add(material);
		return material;
	}

	add(...objects: Object3D[]) {
		this.scene.add(...objects);
	}

	/** Something changed: draw again on the next frame. */
	invalidate() {
		this.dirty = true;
		this.loop.wake();
	}

	turn(direction: number) {
		this.orbit.step(direction);
		this.invalidate();
	}

	setActive(active: boolean) {
		this.loop.setActive(active);
		if (active) this.invalidate();
	}

	resize() {
		const { canvas, radius } = this.options;
		const width = Math.max(1, canvas.clientWidth);
		const height = Math.max(1, canvas.clientHeight);
		this.renderer.setSize(width, height, false);
		const aspect = width / height;
		const half = aspect >= 1 ? radius : radius / aspect;
		this.camera.left = -half * aspect;
		this.camera.right = half * aspect;
		this.camera.top = half;
		this.camera.bottom = -half;
		this.camera.updateProjectionMatrix();
		for (const material of this.lineMaterials) material.resolution.set(width, height);
		for (const material of this.risoMaterials) material.uniforms.uDpr.value = this.pixelRatio;
		this.invalidate();
	}

	dispose() {
		this.disposed = true;
		this.loop.dispose();
		this.resizeObserver?.disconnect();
		const { canvas } = this.options;
		canvas.removeEventListener('webglcontextlost', this.onLost);
		canvas.removeEventListener('pointerdown', this.onDown);
		canvas.removeEventListener('pointermove', this.onMove);
		canvas.removeEventListener('pointerup', this.onUp);
		canvas.removeEventListener('pointercancel', this.onUp);
		this.scene.traverse((object) => {
			const mesh = object as Object3D & {
				geometry?: { dispose(): void };
				material?: { dispose(): void };
			};
			mesh.geometry?.dispose();
			mesh.material?.dispose();
		});
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}

	private placeCamera() {
		const { center } = this.options;
		const distance = 20;
		const azimuth = this.orbit.azimuth;
		this.camera.position.set(
			center.x + distance * Math.cos(ELEVATION) * Math.sin(azimuth),
			center.y + distance * Math.sin(ELEVATION),
			center.z + distance * Math.cos(ELEVATION) * Math.cos(azimuth)
		);
		this.camera.up.set(0, 1, 0);
		this.camera.lookAt(center);
		this.camera.updateMatrixWorld();
	}

	private frame(now: number): boolean {
		if (this.disposed) return false;
		const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, 0.1) : 1 / 60;
		this.lastNow = now;
		const turning = this.orbit.moving;
		this.orbit.update(dt);
		const animating = this.options.animate(now, dt);
		const idleDue = animating === 'idle' && now - this.lastRender >= 1000 / FIGURE_FPS - 1;
		if (this.dirty || turning || animating === true || idleDue) {
			this.lastRender = now;
			this.placeCamera();
			this.renderer.render(this.scene, this.camera);
			countRender(this.options.figure);
			this.dirty = false;
		}
		const more = turning || animating !== false || this.orbit.moving;
		if (!more) this.lastNow = 0;
		return more;
	}

	private readonly onLost = (event: Event) => {
		event.preventDefault();
		this.loop.setActive(false);
		this.options.onlost?.();
	};

	private readonly onDown = (event: PointerEvent) => {
		this.options.canvas.setPointerCapture?.(event.pointerId);
		this.orbit.start(event.clientX, event.timeStamp);
		this.loop.wake();
	};

	private readonly onMove = (event: PointerEvent) => {
		if (!this.orbit.moving) return;
		this.orbit.move(event.clientX, event.timeStamp, this.options.canvas.clientWidth);
		this.loop.wake();
	};

	private readonly onUp = (event: PointerEvent) => {
		const tap = this.orbit.travel < 6;
		this.orbit.end();
		this.loop.wake();
		if (!tap || !this.options.ontap || event.type === 'pointercancel') return;
		const rect = this.options.canvas.getBoundingClientRect();
		const ndc = new Vector2(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1
		);
		this.placeCamera();
		const ray = new Raycaster();
		ray.setFromCamera(ndc, this.camera);
		this.options.ontap(ray);
	};
}
