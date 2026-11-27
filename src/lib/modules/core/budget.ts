/**
 * Budget guard of the InteractionStage (ui/DESIGN.md §10.1, §2.8, konzept §1.4). It measures the
 * rendered stage in the browser, not the characters in the content: lines are what the screen
 * shows at the current width and font. Dev only; it warns in the console and writes the count
 * to `data-budget-violations` on the stage, so a browser test can read it.
 *
 * Parts opt in with `data-budget`:
 *   prompt  · the lead question, at most 3 lines
 *   context · the context line, exactly 1 line
 *   fact    · one fact cell (label or value), each 1 line, never clipped
 *   code    · a code side in the facts, never clipped (its own line breaks stay)
 *   zone    · a zone that must not scroll (the instrument)
 * A control with `data-hit="code-line"` is a full-width code line of 32 px (DESIGN.md §2.1).
 */
export type BudgetRule = 'prompt-lines' | 'context-lines' | 'fact-lines' | 'overflow' | 'hit';

export interface BudgetViolation {
	rule: BudgetRule;
	message: string;
}

export const BUDGET = {
	promptLines: 3,
	contextLines: 1,
	factLines: 1,
	/** DESIGN.md §2.8: every control at least 44 × 44 px. */
	hit: 44,
	/** DESIGN.md §2.1: a code line is a half cell; it spans the full width instead. */
	codeLine: 32
} as const;

/** Lines of a block from its content height; half a line of slack for rounding and descenders. */
export function countLines(height: number, lineHeight: number): number {
	if (lineHeight <= 0 || height <= 0) return 0;
	return Math.max(1, Math.round(height / lineHeight));
}

export interface TextMeasure {
	text: string;
	height: number;
	lineHeight: number;
	/** scrollWidth > clientWidth: the line is clipped or would need horizontal scrolling. */
	clipped?: boolean;
}

export interface StageMeasure {
	prompt?: TextMeasure;
	context?: TextMeasure;
	facts: TextMeasure[];
	/** Measurements of the stage, the document and individual zones. */
	overflow: {
		name: string;
		scrollHeight: number;
		clientHeight: number;
		scrollWidth?: number;
		clientWidth?: number;
	}[];
	/** Controls with their accessible name, rendered size and the height they must reach. */
	hits: { name: string; width: number; height: number; minHeight?: number }[];
}

/** Pure rule check over measured numbers; the DOM part below only collects them. */
export function evaluateBudget(measure: StageMeasure): BudgetViolation[] {
	const violations: BudgetViolation[] = [];
	const lines = (part: TextMeasure) => countLines(part.height, part.lineHeight);
	if (measure.prompt && lines(measure.prompt) > BUDGET.promptLines) {
		violations.push({
			rule: 'prompt-lines',
			message: `Frage hat ${lines(measure.prompt)} Zeilen (höchstens ${BUDGET.promptLines}): „${measure.prompt.text}“`
		});
	}
	if (measure.context && lines(measure.context) > BUDGET.contextLines) {
		violations.push({
			rule: 'context-lines',
			message: `Kontext hat ${lines(measure.context)} Zeilen (genau 1): „${measure.context.text}“`
		});
	}
	for (const fact of measure.facts) {
		if (lines(fact) > BUDGET.factLines || fact.clipped) {
			violations.push({
				rule: 'fact-lines',
				message: `Fakten-Zelle nicht einzeilig: „${fact.text}“`
			});
		}
	}
	for (const box of measure.overflow) {
		// One pixel of slack: fractional layout sizes round differently per engine.
		if (box.scrollHeight > box.clientHeight + 1) {
			violations.push({
				rule: 'overflow',
				message: `${box.name} läuft über: ${box.scrollHeight} px Inhalt auf ${box.clientHeight} px`
			});
		}
		if (
			box.scrollWidth !== undefined &&
			box.clientWidth !== undefined &&
			box.scrollWidth > box.clientWidth + 1
		) {
			violations.push({
				rule: 'overflow',
				message: `${box.name} läuft seitlich über: ${box.scrollWidth} px Inhalt auf ${box.clientWidth} px`
			});
		}
	}
	for (const hit of measure.hits) {
		if (hit.width < BUDGET.hit || hit.height < (hit.minHeight ?? BUDGET.hit)) {
			violations.push({
				rule: 'hit',
				message: `Trefferfläche zu klein: ${hit.name} misst ${Math.round(hit.width)} × ${Math.round(hit.height)} px`
			});
		}
	}
	return violations;
}

function textMeasure(element: HTMLElement): TextMeasure {
	const style = getComputedStyle(element);
	const fontSize = parseFloat(style.fontSize);
	const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight);
	const padding = parseFloat(style.paddingBlockStart) + parseFloat(style.paddingBlockEnd);
	return {
		text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
		height: element.getBoundingClientRect().height - padding,
		lineHeight,
		clipped: element.scrollWidth > element.clientWidth + 1
	};
}

const CONTROLS = 'button, a[href], input, [role="slider"], [role="radio"], [role="checkbox"]';

function isRendered(element: HTMLElement): boolean {
	if (element.closest('[data-budget-skip], .visually-hidden, [hidden]')) return false;
	const rect = element.getBoundingClientRect();
	// Keys that appear only on focus are clipped to nothing until then (SwipeRow keys).
	return rect.width > 1 && rect.height > 1 && getComputedStyle(element).clipPath !== 'inset(50%)';
}

function boxMeasure(name: string, element: HTMLElement, clientHeight = element.clientHeight) {
	return {
		name,
		clientHeight,
		scrollHeight: element.scrollHeight,
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth
	};
}

/** Collects the numbers for evaluateBudget from a rendered stage. Browser only. */
export function measureStage(root: HTMLElement): StageMeasure {
	const one = (name: string) => root.querySelector<HTMLElement>(`[data-budget="${name}"]`);
	const prompt = one('prompt');
	const context = one('context');
	const zones = [...root.querySelectorAll<HTMLElement>('[data-budget="zone"]')];
	const doc = root.ownerDocument.documentElement;
	return {
		prompt: prompt ? textMeasure(prompt) : undefined,
		context: context ? textMeasure(context) : undefined,
		facts: [
			...[...root.querySelectorAll<HTMLElement>('[data-budget="fact"]')].map(textMeasure),
			// A code side keeps its own line breaks; it only must not be clipped or scroll sideways.
			...[...root.querySelectorAll<HTMLElement>('[data-budget="code"]')].map((code) => ({
				...textMeasure(code),
				height: 1,
				lineHeight: 1
			}))
		],
		overflow: [
			boxMeasure('Bühne', root),
			boxMeasure('Dokument', doc, root.ownerDocument.defaultView?.innerHeight),
			...zones.map((zone) => boxMeasure(`Zone ${zone.dataset.zone ?? ''}`.trim(), zone))
		],
		hits: [...root.querySelectorAll<HTMLElement>(CONTROLS)].filter(isRendered).map((control) => {
			const rect = control.getBoundingClientRect();
			const name =
				control.getAttribute('aria-label') ??
				control.textContent?.replace(/\s+/g, ' ').trim() ??
				control.tagName;
			const minHeight = control.dataset.hit === 'code-line' ? BUDGET.codeLine : undefined;
			return { name: name || control.tagName, width: rect.width, height: rect.height, minHeight };
		})
	};
}

/**
 * Svelte attachment for the stage root. Re-measures after layout changes (resize, content,
 * fonts) once per frame and reports new violations. Off in production builds.
 */
export function budgetGuard(enabled: boolean, label: () => string) {
	return (root: HTMLElement) => {
		if (!enabled || typeof ResizeObserver === 'undefined') return;
		let frame = 0;
		let last = '';
		let disposed = false;
		const run = () => {
			frame = 0;
			const violations = evaluateBudget(measureStage(root));
			root.dataset.budgetViolations = String(violations.length);
			const report = violations.map((violation) => violation.message).join('\n');
			if (report === last) return;
			last = report;
			for (const violation of violations) {
				console.warn(`[Budget] ${label()} · ${violation.rule} · ${violation.message}`);
			}
		};
		const schedule = () => {
			if (!disposed && frame === 0) frame = requestAnimationFrame(run);
		};
		const resize = new ResizeObserver(schedule);
		resize.observe(root);
		const viewport = root.ownerDocument.defaultView;
		viewport?.addEventListener('resize', schedule);
		const mutation = new MutationObserver(schedule);
		mutation.observe(root, { childList: true, subtree: true, characterData: true });
		void root.ownerDocument.fonts?.ready.then(schedule);
		schedule();
		return () => {
			disposed = true;
			if (frame !== 0) cancelAnimationFrame(frame);
			viewport?.removeEventListener('resize', schedule);
			resize.disconnect();
			mutation.disconnect();
		};
	};
}
