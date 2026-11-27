export function dockMotion(
	from: number,
	to: number,
	samples: readonly number[],
	frameMs: number
): { keyframes: Keyframe[]; duration: number } {
	const distance = to - from;
	const d = Math.abs(distance) * (samples.length - 1) * frameMs;
	const duration = Number.isFinite(d) && d >= 0 ? d : 0;
	const keyframes = duration
		? samples.map((sample) => {
				const progress = from + distance * sample;
				return { opacity: progress, scale: String(0.8 + 0.2 * progress) };
			})
		: [];
	return { keyframes, duration };
}
