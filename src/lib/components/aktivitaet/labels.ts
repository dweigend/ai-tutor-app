import type { EvidenceKind } from '$lib/api/types';

// Shared with the exercise result panel, so a piece of evidence reads the same everywhere.
export const evidenceKindLabel: Readonly<Record<EvidenceKind, string>> = {
	vorhersage: 'Vorhersage',
	anwendung: 'Anwendung',
	fehlerfund: 'Fehlerfund',
	transfer: 'Transfer'
};
