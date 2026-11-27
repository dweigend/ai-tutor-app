/**
 * P4 Fader: one axis, one grip. Variants as recipes: SpectrumSlider (two poles, the flood),
 * ConfidenceStrip (four steps plus "ohne Angabe"), ScaleFader (a ruler with a mark).
 */
export { default as ConfidenceStrip } from './ConfidenceStrip.svelte';
export { default as Fader } from './Fader.svelte';
export { default as ScaleFader } from './ScaleFader.svelte';
export { default as SpectrumSlider } from './SpectrumSlider.svelte';
export {
	SPECTRUM_DETENTS,
	confidenceLevel,
	confidenceShort,
	confidenceText,
	evenDetents,
	levelConfidence,
	magnetPosition,
	nearestDetent,
	spectrumAnswer,
	spectrumChoice,
	spectrumCommittable,
	spectrumFlood,
	spectrumReading,
	stepDetent,
	type Certainty,
	type Confidence,
	type SpectrumReading,
	type SpectrumSide
} from './scale.js';
