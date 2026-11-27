/**
 * The duck's trigger vocabulary (ui/DESIGN.md §9.2h): one clip name each in the GLB, shared by
 * the 2D and the 3D duck. Plain TypeScript, no three.
 */
export const DUCK_POSES = [
	'wait',
	'listen',
	'think',
	'speak',
	'nod',
	'shake',
	'celebrate',
	'idle_dip'
] as const;

export type DuckPose = (typeof DUCK_POSES)[number];

/** Flip-book rate of the duck and the idle of the figures (§4.1, §9.2e). */
export const FIGURE_FPS = 12;

/** Earliest repeat of an idle gag (§9.2g). */
export const IDLE_GAP_MS = 25_000;

/**
 * Share of the duck canvas above the water (shader-spec: frustum 6,80 × 8,37 units, target
 * height 0,05 + 0,29 · 1440 · 6,80 / 1170, water at 0,05): 0,5 + 0,29. The DOM hairline of the
 * waterline sits at this row.
 */
export const WATER_SHARE = 0.79;
