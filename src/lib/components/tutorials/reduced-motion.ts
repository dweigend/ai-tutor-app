/** Keep a lab in sync with the browser setting until the lab leaves the page. */
export function watchReducedMotion(
	media: EventTarget & Pick<MediaQueryList, 'matches'>,
	setReduced: (reduced: boolean) => void
): () => void {
	const sync = () => setReduced(media.matches);
	media.addEventListener('change', sync);
	sync();
	return () => media.removeEventListener('change', sync);
}
