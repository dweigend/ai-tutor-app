import type { AgentContextSnapshot, ContentVisit, ScreenContext } from '../../memory/types.js';
import type { TutorTurnRequest } from '../../api/types.js';

export function sameCompanionContent(a: ScreenContext, b: ScreenContext): boolean {
	return (
		a.route === b.route &&
		a.tutorialId === b.tutorialId &&
		a.media?.id === b.media?.id &&
		a.taskRef?.taskId === b.taskRef?.taskId &&
		a.taskRef?.courseId === b.taskRef?.courseId &&
		a.taskRef?.courseVersion === b.taskRef?.courseVersion &&
		a.isIndependentProbe === b.isIndependentProbe
	);
}

export function visitFor(screen: ScreenContext): ContentVisit | undefined {
	if (screen.isIndependentProbe) return;
	const kind = screen.media
		? screen.media.kind === 'audio'
			? 'audio'
			: 'video'
		: screen.taskRef
			? 'exercise'
			: screen.route.startsWith('/magazin/')
				? 'essay'
				: screen.route === '/erklaerungen'
					? 'explanation'
					: undefined;
	if (!kind) return;
	return {
		kind,
		route: screen.route,
		contentId: screen.media?.id ?? screen.tutorialId ?? screen.taskRef?.taskId,
		topic: screen.topic,
		title: screen.media?.title ?? screen.topic ?? screen.sectionTitle
	};
}

export function makeRequest(
	snapshot: AgentContextSnapshot,
	text: string,
	sessionId: string,
	revision: number
): TutorTurnRequest | undefined {
	const screen = snapshot.visibleScreen;
	if (screen.isIndependentProbe || !screen.taskRef) return;
	return {
		task: screen.taskRef,
		input: { kind: 'message', text },
		sessionId,
		expectedRevision: revision,
		requestId: crypto.randomUUID(),
		// The HTTP client checks probe completion locally, then applies its sharing policy.
		agentContext: snapshot
	};
}

export function contextLine(snapshot: AgentContextSnapshot): string {
	const screen = snapshot.visibleScreen;
	if (screen.isIndependentProbe) return 'Eigenständige Probe';
	const visit = visitFor(screen);
	const history =
		visit &&
		snapshot.recentHistory.find(
			(item) => item.route === screen.route && item.contentId === visit.contentId
		);
	const seconds = snapshot.dwellStats.find((item) => item.id === history?.id)?.activeSeconds;
	return [
		screen.termLabel ??
			screen.termId ??
			screen.sectionTitle ??
			screen.media?.title ??
			screen.topic ??
			screen.route,
		history && `${Math.floor(seconds ?? 0)} s Lesezeit`
	]
		.filter(Boolean)
		.join(' · ');
}
