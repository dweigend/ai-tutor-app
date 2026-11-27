/**
 * GSAP feedback of the slide decks (DESIGN.md §4.2, §5.8): a happy green blink for a right
 * answer, a soft shake for one that does not fit yet. With reduced motion nothing moves; the
 * state itself (docked bubble, note) already shows the result.
 */
import { gsap } from 'gsap';

export function reducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function present(targets: readonly (Element | null | undefined)[]): Element[] {
	return targets.filter((target): target is Element => !!target);
}

const BLINK = 'backgroundColor,color';

/** Scale pop plus two hard pulses in --status-good-flash, then back to the element's own look. */
export function flashCorrect(...targets: (Element | null | undefined)[]) {
	const elements = present(targets);
	if (!elements.length || reducedMotion()) return;
	const style = getComputedStyle(elements[0]);
	const on = {
		backgroundColor: style.getPropertyValue('--status-good-flash').trim(),
		color: style.getPropertyValue('--status-good-flash-text').trim()
	};
	const pop = { scale: 1.1, duration: 0.09, ease: 'power2.out', yoyo: true, repeat: 1 };
	gsap.killTweensOf(elements, 'scale,x');
	gsap
		.timeline({ onComplete: () => gsap.set(elements, { clearProps: `${BLINK},scale,x` }) })
		.set(elements, on, 0)
		.fromTo(elements, { scale: 1 }, pop, 0)
		.set(elements, { clearProps: BLINK }, 0.2)
		.set(elements, on, 0.34)
		.fromTo(elements, { scale: 1 }, pop, 0.34)
		.set(elements, { clearProps: BLINK }, 0.56);
}

/** A short sideways shake that dies away. */
export function shakeWrong(...targets: (Element | null | undefined)[]) {
	const elements = present(targets);
	if (!elements.length || reducedMotion()) return;
	gsap.killTweensOf(elements, 'x');
	gsap.fromTo(
		elements,
		{ x: 0 },
		{
			keyframes: { x: [0, -8, 8, -6, 6, -3, 0] },
			duration: 0.42,
			ease: 'power1.inOut',
			clearProps: 'x'
		}
	);
}
