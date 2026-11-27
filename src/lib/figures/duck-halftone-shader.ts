import {
	BackSide,
	Color,
	ShaderMaterial,
	Vector2,
	Vector3,
	Float32BufferAttribute,
	type BufferGeometry,
	type MeshStandardMaterial
} from 'three';

const vertex = `
#include <common>
#include <skinning_pars_vertex>
varying vec3 viewPosition;
varying vec2 printUv;
#ifdef HULL
attribute vec3 hullNormal;
uniform vec2 viewport;
uniform float outlineWidth;
#endif
void main(){
 vec3 transformed=position;
 #include <skinbase_vertex>
 #include <skinning_vertex>
 vec4 mv=modelViewMatrix*vec4(transformed,1.);
 viewPosition=mv.xyz;
 printUv=uv;
 gl_Position=projectionMatrix*mv;
 #ifdef HULL
 vec3 objectNormal=hullNormal;
 #include <skinnormal_vertex>
 vec3 n=normalMatrix*objectNormal;
 vec2 dir=(projectionMatrix*vec4(n,0.)).xy*viewport;
 gl_Position.xy+=dir/max(length(dir),0.001)*2.0*outlineWidth/viewport*gl_Position.w;
 #endif
}`;

/** Weld coincident export vertices for extrusion only. Face illumination stays flat. */
export function setHullNormals(geometry: BufferGeometry) {
	const pos = geometry.getAttribute('position'),
		norm = geometry.getAttribute('normal');
	const sums = new Map<string, Vector3>(),
		keys: string[] = [];
	const v = new Vector3();
	for (let i = 0; i < pos.count; i++) {
		const key = [pos.getX(i), pos.getY(i), pos.getZ(i)]
			.map((n) => Math.round(n * 100000))
			.join(',');
		keys.push(key);
		const sum = sums.get(key) ?? new Vector3();
		sums.set(key, sum.add(v.fromBufferAttribute(norm, i)));
	}
	const output = new Float32Array(pos.count * 3);
	keys.forEach((key, i) =>
		sums
			.get(key)!
			.normalize()
			.toArray(output, i * 3)
	);
	geometry.setAttribute('hullNormal', new Float32BufferAttribute(output, 3));
}
/** Below this canvas edge (CSS px) the duck is a corner-sized figure, e.g. the 72 px duck. */
export const MINI_DUCK_PX = 120;
/** Ink line of the full-size duck in CSS px. */
const OUTLINE_PX = 1.5;
/** Thinnest line that still reads as a contour without closing small shapes. */
const MINI_OUTLINE_PX = 0.4;

/**
 * Ink line in CSS px for a canvas of `width` × `height`. A fixed line closes the small shapes of
 * the 72 px corner duck (the far lens of the glasses turned into a black block), so the line
 * thins with the canvas: full width from 240 px, a hairline at corner size.
 */
export function duckOutlineWidth(width: number, height: number): number {
	const edge = Math.min(width, height);
	if (!Number.isFinite(edge) || edge <= 0) return OUTLINE_PX;
	return Math.min(OUTLINE_PX, Math.max(MINI_OUTLINE_PX, (edge / 240) * OUTLINE_PX));
}

/** Whether a canvas is so small that thin accessories (the glasses) get no ink hull at all. */
export function isMiniDuck(width: number, height: number): boolean {
	return Math.min(width, height) <= MINI_DUCK_PX;
}

export function createDuckOutline(viewport: Vector2) {
	return new ShaderMaterial({
		side: BackSide,
		defines: { HULL: 1 },
		uniforms: {
			viewport: { value: viewport },
			outlineWidth: { value: duckOutlineWidth(viewport.x, viewport.y) }
		},
		vertexShader: vertex,
		fragmentShader: `void main(){gl_FragColor=vec4(0.042,0.025,0.018,1.);
 #include <colorspace_fragment>
 }`
	});
}
export function createDuckInk(source: MeshStandardMaterial, group: string, dpr: number) {
	const solid =
		group === 'acc_glasses' ||
		// Printed or glossy details of the four v3 meshes stay flat; no halftone on them.
		[
			'Espresso',
			'Porcelain',
			'Graphite acetate',
			'Butter yellow paper',
			'Club Mate print'
		].includes(source.name);
	return new ShaderMaterial({
		name: source.name,
		defines: { ...(solid ? { SOLID: 1 } : {}), ...(source.map ? { PRINT_MAP: 1 } : {}) },
		uniforms: {
			pigment: { value: source.color.clone() },
			printMap: { value: source.map },
			dpr: { value: dpr },
			ink: { value: new Color('#563525') }
		},
		vertexShader: vertex,
		fragmentShader: `
 varying vec3 viewPosition;
 varying vec2 printUv;
 uniform vec3 pigment,ink;
 uniform sampler2D printMap;
 uniform float dpr;
 void main(){
 vec3 base=pigment;
 #ifdef PRINT_MAP
 base*=texture2D(printMap,printUv).rgb;
 #endif
 #ifndef SOLID
 vec3 normal=normalize(cross(dFdx(viewPosition),dFdy(viewPosition)));
 float key=dot(normal,normalize(vec3(-0.55,0.8,0.7)));
 float fill=max(0.,dot(normal,normalize(vec3(0.9,0.45,0.3))));
 float light=clamp(key*0.54+fill*0.18+0.39,0.,1.);
 float tone=0.65+0.19*step(0.39,light)+0.16*step(0.69,light);
 vec2 cell=fract(mat2(0.94,0.342,-0.342,0.94)*gl_FragCoord.xy/(dpr*4.))-0.5;
 float r=length(cell), aa=max(fwidth(r),0.02);
 float dotInk=(1.-smoothstep(-aa,aa,r-(1.-light)*0.34))*(1.-light);
 base=mix(base*vec3(1.,0.97,0.91)*tone,ink,0.48*dotInk);
 #endif
 gl_FragColor=vec4(base,1.);
 #include <colorspace_fragment>
 }`
	});
}
