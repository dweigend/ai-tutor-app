// Content modules keep one paragraph per string so long texts stay diffable.
export function paragraphs(...parts: readonly string[]): string {
	return parts.join('\n\n');
}
