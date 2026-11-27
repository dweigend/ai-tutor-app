import type { StreamEvent, TutorScope, TutorTurnRequest, WhiteboardSnapshot } from '$lib/api/types';

/**
 * The live tutor on the board: one question back, streamed into a narrow line over the sketch.
 * `asking` has no text yet and shows nothing but the busy key: no typing dots (DESIGN.md §15.8).
 */
export type TutorLine =
	| { phase: 'idle' }
	| { phase: 'asking' }
	| { phase: 'streaming'; text: string }
	| { phase: 'done'; text: string; revision: number }
	| { phase: 'error'; text: string; code: string };

export const IDLE: TutorLine = { phase: 'idle' };

export function whiteboardTurn(
	args: TutorScope & {
		sessionId: string;
		expectedRevision: number;
		requestId: string;
		snapshot: WhiteboardSnapshot;
	}
): TutorTurnRequest {
	const { snapshot, ...turn } = args;
	return { ...turn, input: { kind: 'whiteboard', snapshot } };
}

/** Folds one stream event into the line. The final message wins over the collected deltas. */
export function applyEvent(line: TutorLine, event: StreamEvent): TutorLine {
	switch (event.type) {
		case 'delta': {
			const before = line.phase === 'streaming' ? line.text : '';
			return { phase: 'streaming', text: before + event.text };
		}
		case 'done': {
			const collected = line.phase === 'streaming' ? line.text : '';
			const text = event.response.message?.text ?? collected;
			return { phase: 'done', text: text.trim(), revision: event.response.session.revision };
		}
		case 'error':
			return { phase: 'error', text: event.problem.message, code: event.problem.code };
	}
}

/** Visible once there is something to read. */
export function lineText(line: TutorLine): string | null {
	if (line.phase === 'idle' || line.phase === 'asking') return null;
	return line.text || null;
}
