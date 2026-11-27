import type {
	ApiProblem,
	TutorMoveKind,
	TutorTurnRequest,
	WhiteboardSnapshot
} from '$lib/api/types';

/** How the learner produced a turn; shown as a small tag next to the entry. */
export type LearnerVia = 'reply' | 'free' | 'solution' | 'example' | 'wait' | 'sketch';

export interface LearnerEntry {
	kind: 'learner';
	id: string;
	text: string;
	via: LearnerVia;
	confidence?: number;
	sketch?: WhiteboardSnapshot;
}

export interface TutorEntry {
	kind: 'tutor';
	id: string;
	text: string;
	move: Exclude<TutorMoveKind, 'warten'>;
	media: { id: string; url: string; alt: string }[];
	/** The turn answered a request for the solution: the delegation boundary held. */
	boundary: boolean;
}

export type TranscriptEntry =
	| LearnerEntry
	| TutorEntry
	| { kind: 'wait'; id: string }
	| { kind: 'note'; id: string; text: string };

/** The turn in flight or left unconfirmed; it joins the transcript only once the API confirms it. */
export interface LiveTurn {
	request: TutorTurnRequest;
	learner: LearnerEntry;
	text: string;
	status: 'streaming' | 'aborted' | 'failed';
	problem?: ApiProblem;
}

/**
 * True only when the server clearly refused the turn and stored nothing. Then the turn may be
 * discarded and the session stays on its revision. After an abort, a network or protocol error
 * or any retryable failure the turn may already be stored: discarding it would leave a stale
 * revision and the next turn would hit a 409 conflict.
 */
export function rejectedByServer(turn: LiveTurn): boolean {
	if (turn.status !== 'failed' || !turn.problem || turn.problem.retryable) return false;
	return (
		turn.problem.code !== 'network' &&
		turn.problem.code !== 'protocol' &&
		turn.problem.code !== 'conflict'
	);
}
