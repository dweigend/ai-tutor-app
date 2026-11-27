import { browser } from '$app/environment';
import { ScreenContextStore, LearningMemoryStore, buildAgentContextSnapshot } from './index';
import type { ScreenContextInput, NoteInput, HomeSignal, MemoryEntryKind } from './index';
import { visitFor } from '../components/companion/companion-logic';
import { exerciseForTask } from '$lib/content/uebungen';
import { findEntry } from '$lib/components/magazin/article';
import { tutorScenarios } from '$lib/content/tutor';

const contexts = new ScreenContextStore();
const memory = new LearningMemoryStore();
let current = $state.raw(contexts.getSnapshot());
let stored = $state.raw(memory.exportSnapshot());
let visitKey = '';
function refresh() {
	stored = memory.exportSnapshot();
}

let viewPublishesContext = false;
function updateScreen(input: ScreenContextInput) {
	if (!browser || input.route !== location.pathname) return;
	contexts.setScreen($state.snapshot(input));
	const screen = contexts.getSnapshot();
	current = screen;
	const visit = visitFor(screen);
	const key = visit ? JSON.stringify([visit.route, visit.kind, visit.contentId]) : '';
	if (key === visitKey) return;
	visitKey = key;
	if (visit) memory.recordVisit(visit);
	else memory.leaveContent();
	refresh();
}
export const screenContext = {
	get current() {
		return current;
	},
	setScreen(input: ScreenContextInput) {
		if (!browser || input.route !== location.pathname) return;
		viewPublishesContext = true;
		updateScreen(input);
	},
	snapshot() {
		return buildAgentContextSnapshot(current, memory);
	}
};

const labels: Record<string, string> = {
	'/': 'Startseite',
	'/erklaerungen': 'Erklärungen',
	'/uebungen': 'Übungen',
	'/magazin': 'Magazin',
	'/whiteboard': 'Whiteboard',
	'/aktivitaet': 'Aktivität',
	'/tutor': 'Tutor'
};

export function resetRoute(url: URL) {
	const route = url.pathname;
	const exercise =
		route === '/uebungen' ||
		(route === '/whiteboard' && url.searchParams.get('returnTo') === 'uebungen')
			? exerciseForTask(url.searchParams.get('aufgabe') ?? url.searchParams.get('task'))
			: undefined;
	const scenario =
		route === '/whiteboard' &&
		tutorScenarios.find((item) => item.id === url.searchParams.get('scenario'));
	const entry = route.startsWith('/magazin/') && findEntry(route.slice('/magazin/'.length));
	const taskRef = exercise?.task ?? (scenario ? (scenario.task ?? undefined) : undefined);
	viewPublishesContext = false;
	updateScreen({
		route,
		taskRef,
		courseId: taskRef?.courseId ?? (scenario ? scenario.course?.courseId : undefined),
		topic: exercise?.title ?? (entry ? entry.item.question : labels[route]),
		media:
			entry && entry.kind === 'episode'
				? { kind: 'audio', id: entry.item.id, title: entry.item.title }
				: undefined
	});
}

export const learningMemory = {
	snapshot(screen: typeof current) {
		return buildAgentContextSnapshot(screen, memory);
	},
	get current() {
		return stored;
	},
	refresh() {
		refresh();
	},
	addNote(kind: NoteInput['kind'], text: string) {
		if (current.isIndependentProbe) return;
		const { route, topic, termId, sectionTitle } = current;
		memory.addNote({ kind, text, route, topic, termId, sectionTitle });
		refresh();
	},
	recordHomeSignal(topic: string, signal: HomeSignal) {
		if (!current.isIndependentProbe) {
			const undo = memory.recordHomeSignal(topic, signal);
			refresh();
			if (undo)
				return () => {
					undo();
					refresh();
				};
		}
	},
	deleteEntry(kind: MemoryEntryKind, id: string) {
		memory.deleteEntry(kind, id);
		refresh();
	},
	clearAll() {
		memory.clearAll();
		refresh();
	}
};

export function bindVisibility() {
	function syncVisibility() {
		memory.setVisible(!document.hidden);
		refresh();
	}
	document.addEventListener('visibilitychange', syncVisibility);
	syncVisibility();
	return () => {
		document.removeEventListener('visibilitychange', syncVisibility);
		memory.setVisible(false);
	};
}

// Older stages expose their selection through accessible control state. A view
// publishing its typed context takes ownership immediately.
function readStage(node: HTMLElement) {
	if (viewPublishesContext || current.route !== location.pathname) return;
	const stage = node.querySelector('.stage');
	let patch: Partial<ScreenContextInput>;
	switch (current.route) {
		case '/erklaerungen': {
			const tutorial = node.querySelector('[aria-label="Tutorial wählen"] [aria-checked="true"]');
			const active = node.querySelector('.terms button[aria-expanded="true"]');
			const formula =
				active?.closest('.interactive')?.querySelector<HTMLElement>('[data-formula-id]') ??
				stage?.querySelector<HTMLElement>('[data-formula-id]');
			const term = active?.textContent?.trim();
			patch = {
				tutorialId: tutorial?.getAttribute('value') ?? undefined,
				topic: tutorial?.getAttribute('aria-label') ?? labels[current.route],
				sectionTitle:
					stage?.getAttribute('aria-label') ??
					node.querySelector('.backprop')?.getAttribute('aria-label') ??
					undefined,
				momentId: stage?.querySelector('.stage-context')?.textContent?.trim(),
				formulaId: formula?.dataset.formulaId,
				formulaLatex: formula?.querySelector('annotation')?.textContent ?? undefined,
				termId: term,
				termLabel: term
			};
			break;
		}
		default: {
			if (current.media?.kind !== 'audio') return;
			const chapter = node
				.querySelector('.audio-chapter[aria-current="true"] .audio-chapter-title')
				?.textContent?.trim();
			patch = { media: { ...current.media, chapter } };
			break;
		}
	}
	const next = { ...current, ...patch };
	if (JSON.stringify(next) !== JSON.stringify(current)) updateScreen(next);
}

/** Observe editorial sections of the current view. Register after its DOM has mounted. */
export function observeSections(node: HTMLElement) {
	const changes = new MutationObserver(() => readStage(node));
	changes.observe(node, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['data-state', 'aria-checked', 'aria-expanded', 'aria-current']
	});
	readStage(node);
	const sections = Array.from(node.querySelectorAll<HTMLElement>('section[id], [data-section-id]'));
	const visible = new Set<Element>();
	function selectSection() {
		if (!node.isConnected || current.route !== location.pathname || current.route === '/uebungen')
			return;
		const firstBelowHeader = sections.findIndex(
			(section) => visible.has(section) && section.getBoundingClientRect().top >= 56
		);
		const index =
			firstBelowHeader >= 0
				? firstBelowHeader
				: sections.findLastIndex((section) => visible.has(section));
		const section = sections[index];
		if (!section) {
			if (
				sections.length &&
				sections.some((item) => (item.dataset.sectionId ?? item.id) === current.sectionId)
			) {
				updateScreen({
					...current,
					sectionId: undefined,
					sectionTitle: undefined,
					termId: undefined,
					termLabel: undefined
				});
			}
			return;
		}
		if (!section.isConnected) return;
		const sectionId = section.dataset.sectionId ?? section.id;
		const sectionTitle =
			section.dataset.sectionTitle ??
			section.querySelector('h2,h3')?.textContent?.replace(/^>>/, '').trim();
		if (current.sectionId === sectionId && current.sectionTitle === sectionTitle) return;
		updateScreen({
			...current,
			sectionId,
			sectionTitle,
			termId: undefined,
			termLabel: undefined
		});
		if (!current.isIndependentProbe) {
			memory.recordDepth((index + 1) / sections.length);
			refresh();
		}
	}
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) visible.add(entry.target);
				else visible.delete(entry.target);
			}
			selectSection();
		},
		{ rootMargin: '-64px 0px -45% 0px' }
	);
	// Two sections may stay intersecting while the first heading passes behind the header.
	if (sections.length)
		window.addEventListener('scroll', selectSection, { passive: true, capture: true });

	for (const section of sections) observer.observe(section);
	return {
		destroy() {
			window.removeEventListener('scroll', selectSection, true);
			changes.disconnect();
			observer.disconnect();
			visible.clear();
		}
	};
}
