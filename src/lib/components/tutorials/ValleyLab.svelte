<script lang="ts">
	import { Formula } from '$lib/math';
	import { valleyLossFormula } from '$lib/math/lab-formulas.js';
	import { diverges, stepFactor, VALLEY_EXTENT } from '$lib/figures';
	import { AxisPad, FigurePlate, Readout } from '$lib/modules';
	import ValleyFigure from './ValleyFigure.svelte';
	import LabStage from './LabStage.svelte';
	import LabFinding from './LabFinding.svelte';
	import { formatNumber } from './math';

	let { context, onnext }: { context: string; onnext: () => void } = $props();

	// 90% of the distance to the rim means 81% of the quadratic wall height.
	const START = { x: -0.9 * VALLEY_EXTENT, y: 0.9 * VALLEY_EXTENT };
	const ETA = { min: 0.05, max: 1.2, step: 0.05, unit: 'η' };
	const KAPPA = { min: 0.25, max: 1.5, step: 0.05, unit: 'κ' };

	let eta = $state(0.25);
	let kappa = $state(1);
	let height = $state(0);
	let covered = $state(false);
	let params = $derived({ eta, kappa, start: START, free: true });
	const n = (value: number) => formatNumber(Math.abs(value) < 0.005 ? 0 : value, 2);
</script>

<LabStage {context} {onnext} bind:covered>
	{#snippet figure()}
		<FigurePlate.Root index={1} label="Das Tal">
			<ValleyFigure {params} interactive paused={covered} onheight={(next) => (height = next)} />
			<FigurePlate.Caption>
				<Formula formula={valleyLossFormula} />
				<Readout.Facts
					facts={{
						kind: 'cells',
						cells: [
							{ label: 'η', value: n(eta) },
							{ label: 'κ', value: n(kappa) },
							{ label: 'Faktor', value: n(stepFactor(eta, kappa)) },
							{ label: 'f', value: n(height) }
						]
					}}
				/>
			</FigurePlate.Caption>
		</FigurePlate.Root>
	{/snippet}

	<LabFinding deviates={diverges(eta, kappa)} text="Tippen ins Tal setzt deine Vorhersage." />
	<div class="valley-pad">
		<AxisPad
			x={ETA}
			y={KAPPA}
			bind:valueX={eta}
			bind:valueY={kappa}
			label="Lernrate η und Krümmung κ"
		/>
	</div>
</LabStage>

<style>
	.valley-pad {
		--axis-pad-height: clamp(104px, calc(50dvh - 211px), 228px);
	}
</style>
