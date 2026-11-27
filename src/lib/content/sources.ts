import type { ContentSource, EssaySource } from './types.js';

export function repoSource(label: string, _path: string): ContentSource {
	return { label };
}

/** A source with the stable id the Hermes essay schema references (`evidenceById`). */
export function essaySource(sourceId: string, source: ContentSource): EssaySource {
	return { sourceId, ...source };
}

// Studies cited by more than one module. Single-use sources stay next to their text.
export const studies = {
	bastani: {
		label: 'Bastani et al. 2025 · Generative AI without guardrails can harm learning (PNAS)',
		href: 'https://doi.org/10.1073/pnas.2422633122'
	},
	kestin: {
		label: 'Kestin et al. 2025 · AI tutoring outperforms in-class active learning',
		href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/'
	},
	bassner: {
		label: 'Bassner et al. 2026 · Iris-Studie an der TUM mit 275 ausgewerteten Studierenden',
		href: 'https://doi.org/10.1016/j.caeai.2025.100537'
	},
	dice: {
		label: 'DICE · Decoupling Capability from Intervention Necessity in LLM Tutoring',
		href: 'https://arxiv.org/abs/2610.04825'
	},
	soderstromBjork: {
		label: 'Soderstrom & Bjork 2015 · Learning versus performance',
		href: 'https://doi.org/10.1177/1745691615569000'
	},
	roedigerKarpicke: {
		label: 'Roediger & Karpicke 2006 · Test-enhanced learning',
		href: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x'
	},
	cepeda: {
		label: 'Cepeda et al. 2006 · Distributed practice',
		href: 'https://doi.org/10.1037/0033-2909.132.3.354'
	},
	brunmairRichter: {
		label: 'Brunmair & Richter 2019 · Interleaving, Metaanalyse',
		href: 'https://pubmed.ncbi.nlm.nih.gov/31556629/'
	},
	riskoGilbert: {
		label: 'Risko & Gilbert 2016 · Cognitive offloading',
		href: 'https://doi.org/10.1016/j.tics.2016.07.002'
	},
	zellKrizan: {
		label: 'Zell & Krizan 2014 · Do people have insight into their abilities?',
		href: 'https://doi.org/10.1177/1745691613518075'
	},
	guo: {
		label: 'Guo et al. 2017 · On calibration of modern neural networks',
		href: 'https://proceedings.mlr.press/v70/guo17a.html'
	},
	vaswani: {
		label: 'Vaswani et al. 2017 · Attention is all you need, §3.2.1',
		href: 'https://arxiv.org/abs/1706.03762'
	}
} as const satisfies Record<string, ContentSource>;

/** A shared study as an essay source; its key in `studies` is the stable source id. */
export function study(key: keyof typeof studies): EssaySource {
	return essaySource(key, studies[key]);
}
