/**
 * Drawn indentation of code (art-director correction K3): every nesting level is drawn with two
 * spaces, whatever the source uses, so a program keeps its lines on a phone at 13 px. The model
 * solution in the content keeps its own indentation; only the display changes.
 */

/** Spaces per level in the content's code (Python, PEP 8). */
export const SOURCE_INDENT = 4;
/** Spaces per level on screen. */
export const DRAWN_INDENT = 2;

/** One source line split into its drawn indentation (in spaces) and the text after it. */
export function drawnIndent(line: string): { indent: number; text: string } {
	const text = line.trimStart();
	const spaces = line.length - text.length;
	return { indent: Math.ceil((spaces * DRAWN_INDENT) / SOURCE_INDENT), text };
}

/** The whole code with every line re-indented for display. */
export function drawnCode(code: string): string {
	return code
		.split('\n')
		.map((line) => {
			const { indent, text } = drawnIndent(line);
			return ' '.repeat(indent) + text;
		})
		.join('\n');
}
