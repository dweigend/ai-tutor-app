import type { TutorMoveKind } from '$lib/api/types';
import type { DuckPose } from '$lib/figures';

/**
 * Trigger API of the duck (ui/DESIGN.md §9.2f–h): one mapping from the tutor's state and moves
 * to the eight poses, the same for the 2D and the 3D duck.
 *
 * - Listening while the learner writes, thinking while the request is open, speaking while the
 *   text streams in.
 * - After a confirmed turn one short reaction, then `wait`: while the learner thinks, the duck
 *   stands still (§9.2g).
 * - The head shake belongs to the delegation boundary only (§9.2f). A deviation never gets it:
 *   it is a question with a tilted head, i.e. `wait` after `think`.
 */

/** The one place a head shake is triggered: "Das rechnest du." */
export const BOUNDARY_POSE: DuckPose = 'shake';

export type DuckPhase = 'rest' | 'listen' | 'think' | 'speak';

export function poseForPhase(phase: DuckPhase): DuckPose {
	if (phase === 'listen') return 'listen';
	if (phase === 'think') return 'think';
	if (phase === 'speak') return 'speak';
	return 'wait';
}

/** Moves that confirm what the learner said: one nod. */
const CONFIRMING: readonly TutorMoveKind[] = ['paraphrasieren'];

/** The short reaction after a confirmed tutor turn; `wait` means none. */
export function reactionFor(turn: { move: TutorMoveKind; boundary: boolean }): DuckPose {
	if (turn.boundary) return BOUNDARY_POSE;
	if (turn.move === 'abschliessen') return 'celebrate';
	if (CONFIRMING.includes(turn.move)) return 'nod';
	return 'wait';
}

/** Idle gags only before the start and after the session is closed (§9.2g). */
export function idleAllowed(started: boolean, finished: boolean): boolean {
	return !started || finished;
}

// Source-frame intervals converted from the 24 fps v3 GLB to the legacy 12 fps timer.
export const POSE_FRAMES: Readonly<Record<DuckPose, number>> = {
	wait: 0,
	idle: 48,
	idle_dip: 0,
	look_around: 36,
	listen: 25,
	think: 36,
	speak: 21,
	giggle: 19,
	nod: 18,
	shake: 19,
	celebrate: 20.5
};
export function isOneShot(pose: DuckPose): boolean {
	return ['look_around', 'giggle', 'nod', 'shake', 'celebrate'].includes(pose);
}
