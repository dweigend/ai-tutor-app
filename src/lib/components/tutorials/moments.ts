import type { InteractiveTutorial, TutorialCheck, TutorialLab } from '$lib/content/types';

/**
 * A tutorial as a row of single moments (DESIGN.md §1.1, §10.1): one reading card of at most
 * 60 words, one prediction, one quiz question or one lab per screen. The content stays as it is;
 * long explanations are cut at their paragraphs, never inside one.
 */
export type Moment = { id: string; step: number } & (
	| { kind: 'read'; worked: boolean; markdown: string }
	| {
			kind: 'check';
			blockId: string;
			mode: 'prediction' | 'quiz';
			check: TutorialCheck;
			reasoningPrompt?: string;
			askConfidence?: boolean;
			revealMarkdown?: string;
	  }
	| { kind: 'lab'; lab: TutorialLab }
	| { kind: 'valley' }
);

export const READING_WORDS = 60;

/** The valley lab follows the learning-rate prediction, so it never gives the answer away. */
export const VALLEY_AFTER = 'lernrate-vorhersage';

function words(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

/** Groups paragraphs into cards of at most `limit` words; a longer paragraph stays whole. */
export function readingCards(markdown: string, limit = READING_WORDS): string[] {
	const cards: string[] = [];
	let current: string[] = [];
	let count = 0;
	for (const paragraph of markdown.split(/\n{2,}/)) {
		const size = words(paragraph);
		if (current.length && count + size > limit) {
			cards.push(current.join('\n\n'));
			current = [];
			count = 0;
		}
		current.push(paragraph);
		count += size;
	}
	if (current.length) cards.push(current.join('\n\n'));
	return cards;
}

export function momentsOf(tutorial: InteractiveTutorial): Moment[] {
	const moments: Moment[] = [];
	tutorial.steps.forEach((step, index) => {
		for (const block of step.blocks) {
			if (block.kind === 'explanation' || block.kind === 'worked-example') {
				readingCards(block.markdown).forEach((markdown, part) =>
					moments.push({
						id: `${block.id}-${part}`,
						step: index,
						kind: 'read',
						worked: block.kind === 'worked-example',
						markdown
					})
				);
			} else if (block.kind === 'prediction') {
				moments.push({
					id: block.id,
					step: index,
					kind: 'check',
					blockId: block.id,
					mode: 'prediction',
					check: block.check,
					reasoningPrompt: block.reasoningPrompt,
					askConfidence: block.askConfidence,
					revealMarkdown: block.revealMarkdown
				});
			} else if (block.kind === 'micro-quiz') {
				for (const check of block.checks) {
					moments.push({
						id: `${block.id}-${check.id}`,
						step: index,
						kind: 'check',
						blockId: block.id,
						mode: 'quiz',
						check
					});
				}
			} else if (block.kind === 'lab') {
				moments.push({ id: block.id, step: index, kind: 'lab', lab: block.config });
			}
			if (block.id === VALLEY_AFTER) {
				moments.push({ id: 'tal', step: index, kind: 'valley' });
			}
		}
	});
	return moments;
}

/** Short kind word for the context line (`02/05 · Lesen`). */
export function momentWord(moment: Moment): string {
	if (moment.kind === 'read') return moment.worked ? 'Vorgerechnet' : 'Lesen';
	if (moment.kind === 'check') return moment.mode === 'prediction' ? 'Vorhersage' : 'Prüfen';
	return 'Labor';
}
