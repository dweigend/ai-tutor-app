import katex from 'katex';

export const katexOptions = {
	trust: false,
	throwOnError: true,
	maxExpand: 100,
	maxSize: 10
} as const;

/** Leaves the caller's spoken fallback visible if a formula cannot be rendered. */
export function renderFormula(latex: string, element: HTMLElement): boolean {
	element.replaceChildren();
	try {
		katex.render(latex, element, katexOptions);
		return true;
	} catch (error) {
		if (!(error instanceof katex.ParseError)) throw error;
		return false;
	}
}
