/**
 * Two-colour print pass (ui/DESIGN.md §9.1, arbeitsplan/02-ui/3d-ente/shader-spec.md).
 *
 * Duck, pass 1 (`createRegionMaterial`): every device pixel gets the visible region ID of the
 * duck and the signed light value f, interpolated over the triangle. No three.js light, no
 * standard material: the light is the fixed vector L in camera space, used as a hard threshold.
 *
 * Duck, pass 2 (`createPrintMaterial`): reads IDs and f per integer pixel, unfiltered, and prints
 * exactly like the reference code: ink ground, yellow regions, a 45° raster that hangs on the
 * output origin (screen space, so the duck moves under standing dots), two dot sizes, a dot at a
 * region edge only when it is whole, ink eyes and lids, the orange beak plate shifted by
 * (+1, −1) CSS px with its mouth joint.
 *
 * Figures (`createRisoSurfaceMaterial`): a flat fill per object with the same screen raster on
 * the side turned away from the light. Unlit, no gradient, no texture.
 */
import {
	DoubleSide,
	GLSL3,
	RawShaderMaterial,
	ShaderMaterial,
	Vector2,
	Vector3,
	type Texture
} from 'three';

/** sRGB print colours, exact bytes (§5, §9.1). */
export const PRINT = {
	ink: [10, 10, 10],
	yellow: [244, 184, 16],
	orange: [232, 93, 26],
	paper: [244, 241, 234],
	white: [255, 255, 255],
	crimson: [184, 20, 68]
} as const;

export type PrintColour = keyof typeof PRINT;

function glslColour(name: PrintColour): string {
	return `vec3(${PRINT[name].map((byte) => (byte / 255).toFixed(6)).join(', ')})`;
}

/** Light in camera space, unnormalised (shader-spec §Regionsmaske und Licht). */
export const LIGHT_CAMERA = new Vector3(-0.7, 0.73, 0.03);
/** Thresholds of the two raster steps. */
export const SHADE_LIGHT = -0.38;
export const SHADE_CORE = -0.63;
/** Dot radii in CSS px for the two steps; spacing 4 CSS px on 45° axes. */
export const DOT_SMALL = 0.72;
export const DOT_CORE = 1.22;
export const RASTER_STEP = 4;

/**
 * Region IDs per triangle of the production GLB, in the original index order
 * (inclusive ranges, shader-spec table). 1 body, 2 neck and head, 4 tuft, 6 eye, 7 lid stroke,
 * 8 upper beak, 9 lower beak.
 */
export const DUCK_REGIONS: readonly (readonly [first: number, last: number, id: number])[] = [
	[0, 1275, 1],
	[1276, 2415, 2],
	[2416, 2587, 4],
	[2588, 2697, 6],
	[2698, 2741, 7],
	[2742, 2851, 6],
	[2852, 2895, 7],
	[2896, 2939, 8],
	[2940, 2983, 9]
];

export function regionOfTriangle(triangle: number): number {
	for (const [first, last, id] of DUCK_REGIONS) {
		if (triangle >= first && triangle <= last) return id;
	}
	return 0;
}

// Pass 1: ID and light value. The shadow terms use the deformed mesh in Blender axes:
// Blender x = three x, Blender z = three y (glTF Y up).
const REGION_VERTEX = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

attribute float region;
uniform vec3 uLight;

varying float vRegion;
varying float vShade;

void main() {
	#include <beginnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <skinning_vertex>
	#include <project_vertex>

	vec3 nCam = normalize(transformedNormal);
	float f = dot(nCam, uLight);
	vec4 world = modelMatrix * vec4(transformed, 1.0);
	float bx = world.x;
	float bz = world.y;
	if (region > 0.5 && region < 2.5) {
		float u = (bx - 0.66) / 1.3;
		float shadow = -1.08 + 2.4 * u * u + 2.1 * max(0.0, 0.70 - bz);
		if (region < 1.5) {
			f = min(f - 0.60 * mvPosition.x + 0.20, shadow);
		} else {
			float a = clamp((bz - 1.30) / 0.36, 0.0, 1.0);
			f = a * f + (1.0 - a) * shadow;
		}
	}
	vRegion = region;
	vShade = f;
}
`;

// f in [-8, 8] as 16-bit fixed point in R and G, the region ID in B, coverage in A.
const REGION_FRAGMENT = /* glsl */ `
varying float vRegion;
varying float vShade;

void main() {
	float q = floor(clamp((vShade + 8.0) / 16.0, 0.0, 1.0) * 65535.0 + 0.5);
	float hi = floor(q / 256.0);
	float lo = q - hi * 256.0;
	gl_FragColor = vec4(hi / 255.0, lo / 255.0, floor(vRegion + 0.5) / 255.0, 1.0);
}
`;

export function createRegionMaterial(): ShaderMaterial {
	return new ShaderMaterial({
		vertexShader: REGION_VERTEX,
		fragmentShader: REGION_FRAGMENT,
		uniforms: { uLight: { value: LIGHT_CAMERA.clone() } },
		side: DoubleSide,
		depthTest: true,
		depthWrite: true,
		toneMapped: false
	});
}

const FULLSCREEN_VERTEX = /* glsl */ `
precision highp float;
in vec3 position;
void main() {
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Pass 2: the reference print, per device pixel. Coordinates top-left, y down (shader-spec).
const PRINT_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uIds;
uniform vec2 uSize;
uniform float uDpr;
uniform float uWater;

out vec4 fragColor;

int W;
int H;
int WATER;

vec4 texAt(ivec2 p) {
	return texelFetch(uIds, ivec2(p.x, H - 1 - p.y), 0);
}

int idAt(ivec2 p) {
	if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H || p.y >= WATER) return 0;
	return int(texAt(p).b * 255.0 + 0.5);
}

float shadeAt(ivec2 p) {
	vec4 t = texAt(p);
	float q = floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5);
	return q / 65535.0 * 16.0 - 8.0;
}

int wrap(int v, int n) {
	int m = v - (v / n) * n;
	return m < 0 ? m + n : m;
}

// np.roll with positive modulo: moved[y, x] = IDs[(y + d) mod h, (x - d) mod w].
int movedAt(ivec2 p, int d) {
	return idAt(ivec2(wrap(p.x - d, W), wrap(p.y + d, H)));
}

bool printed(ivec2 p) {
	float a = 4.0 * uDpr / sqrt(2.0);
	float fx = float(p.x);
	float fy = float(p.y);
	int i = int(roundEven((fx + fy) / (2.0 * a)));
	int j = int(roundEven((fx - fy) / (2.0 * a)));
	int row = i - j;
	if (row < 0) return false;
	int maxRow = int(floor(min(float(WATER), float(H)) / a));
	if (row > maxRow) return false;
	int parity = row - (row / 2) * 2;
	int col2 = i + j - parity;
	if (col2 < 0) return false;
	int col = col2 / 2;
	if (col > int(floor(float(W) / (2.0 * a))) + 1) return false;
	int cx = int(roundEven((float(col) + 0.5 * float(parity)) * 2.0 * a));
	int cy = int(roundEven(float(row) * a));
	if (cx < 0 || cx >= W || cy < 0 || cy >= WATER) return false;
	ivec2 c = ivec2(cx, cy);
	int id = idAt(c);
	if (id < 1 || id > 3) return false;
	float f = shadeAt(c);
	if (f >= ${SHADE_LIGHT.toFixed(2)}) return false;
	float r = (f < ${SHADE_CORE.toFixed(2)} ? ${DOT_CORE.toFixed(2)} : ${DOT_SMALL.toFixed(2)}) * uDpr;
	int k = int(ceil(r));
	if (cx < k || cy < k || cx + k >= W || cy + k >= WATER) return false;
	int dx = p.x - cx;
	int dy = p.y - cy;
	float r2 = r * r;
	if (float(dx * dx + dy * dy) > r2) return false;
	// A dot at an edge appears only whole: every disk pixel must carry the same region.
	for (int oy = -8; oy <= 8; oy++) {
		if (oy < -k || oy > k) continue;
		for (int ox = -8; ox <= 8; ox++) {
			if (ox < -k || ox > k) continue;
			if (float(ox * ox + oy * oy) > r2) continue;
			if (idAt(c + ivec2(ox, oy)) != id) return false;
		}
	}
	return true;
}

void main() {
	W = int(uSize.x);
	H = int(uSize.y);
	WATER = int(uWater);
	ivec2 fb = ivec2(floor(gl_FragCoord.xy));
	ivec2 p = ivec2(fb.x, H - 1 - fb.y);
	int d = int(uDpr + 0.5);

	vec3 colour = ${glslColour('ink')};
	int id = idAt(p);
	if (id > 0) colour = ${glslColour('yellow')};
	if (id >= 1 && id <= 3 && printed(p)) colour = ${glslColour('ink')};
	if (id >= 6 && id <= 9) colour = ${glslColour('ink')};

	int moved = movedAt(p, d);
	if (moved >= 8) {
		colour = ${glslColour('orange')};
		if (moved == 8) {
			for (int i = 1; i <= 8; i++) {
				if (i > d) break;
				if (movedAt(ivec2(p.x, wrap(p.y + i, H)), d) == 9) {
					colour = ${glslColour('ink')};
					break;
				}
			}
		}
	}
	fragColor = vec4(colour, 1.0);
}
`;

export function createPrintMaterial(ids: Texture): RawShaderMaterial {
	return new RawShaderMaterial({
		glslVersion: GLSL3,
		vertexShader: FULLSCREEN_VERTEX,
		fragmentShader: PRINT_FRAGMENT,
		uniforms: {
			uIds: { value: ids },
			uSize: { value: new Vector2(1, 1) },
			uDpr: { value: 1 },
			uWater: { value: 0 }
		},
		depthTest: false,
		depthWrite: false
	});
}

// Figures: one flat print colour per object plus the screen-fixed raster on the shadow side.
const SURFACE_VERTEX = /* glsl */ `
uniform vec3 uLight;
varying float vShade;

void main() {
	vec3 nCam = normalize(normalMatrix * normal);
	vShade = dot(nCam, uLight);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uDpr;
uniform float uRaster;
varying float vShade;

void main() {
	vec3 colour = uColour;
	float f = gl_FrontFacing ? vShade : -vShade;
	if (uRaster > 0.5 && f < ${SHADE_LIGHT.toFixed(2)}) {
		// Nearest centre of the 45° lattice with 4 CSS px spacing, fixed to the output origin.
		float a = 4.0 * uDpr / sqrt(2.0);
		vec2 p = floor(gl_FragCoord.xy);
		float i = roundEven((p.x + p.y) / (2.0 * a));
		float j = roundEven((p.x - p.y) / (2.0 * a));
		vec2 c = vec2(roundEven((i + j) * a), roundEven((i - j) * a));
		float r = (f < ${SHADE_CORE.toFixed(2)} ? ${DOT_CORE.toFixed(2)} : ${DOT_SMALL.toFixed(2)}) * uDpr;
		vec2 d = p - c;
		if (dot(d, d) <= r * r) colour = ${glslColour('ink')};
	}
	gl_FragColor = vec4(colour, 1.0);
}
`;

function colourVector(name: PrintColour): Vector3 {
	const [r, g, b] = PRINT[name];
	return new Vector3(r / 255, g / 255, b / 255);
}

/** Unlit flat print colour with the screen raster on the side away from the light. */
export function createRisoSurfaceMaterial(
	colour: PrintColour,
	options: { raster?: boolean; dpr?: number } = {}
): ShaderMaterial {
	return new ShaderMaterial({
		vertexShader: SURFACE_VERTEX,
		fragmentShader: SURFACE_FRAGMENT,
		uniforms: {
			uLight: { value: LIGHT_CAMERA.clone() },
			uColour: { value: colourVector(colour) },
			uDpr: { value: options.dpr ?? 1 },
			uRaster: { value: options.raster === false ? 0 : 1 }
		},
		side: DoubleSide,
		toneMapped: false
	});
}

export function setRisoColour(material: ShaderMaterial, colour: PrintColour) {
	(material.uniforms.uColour.value as Vector3).copy(colourVector(colour));
}

/** CSS colour string of a print colour (for LineMaterial and the 2D sheet). */
export function cssColour(name: PrintColour): string {
	const [r, g, b] = PRINT[name];
	return `#${[r, g, b].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
