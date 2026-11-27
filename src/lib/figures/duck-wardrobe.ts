/**
 * Wardrobe of the v3 duck (issue #59). The GLB carries exactly four meshes: `duck_body` plus the
 * three accessories below. The learner never dresses the duck piece by piece. There are two
 * looks: the everyday duck with glasses, and the hipster easter egg with beanie, glasses and a
 * bottle of Club-Mate.
 */
export const ACCESSORIES = {
	glasses: 'acc_glasses',
	beanie: 'acc_beanie',
	clubMate: 'acc_club_mate'
} as const;
export type DuckAccessory = keyof typeof ACCESSORIES;
export interface DuckWardrobe {
	/** Everyday look: glasses on. */
	glasses: boolean;
	/** Easter egg: beanie, glasses and Club-Mate together. */
	hipster: boolean;
}
export const DEFAULT_WARDROBE: Readonly<DuckWardrobe> = Object.freeze({
	glasses: true,
	hipster: false
});

/** Which accessory meshes a look shows. The hipster always wears the glasses. */
export function accessoriesFor(value: Partial<DuckWardrobe>): Record<DuckAccessory, boolean> {
	const hipster = value.hipster ?? DEFAULT_WARDROBE.hipster;
	return {
		glasses: hipster || (value.glasses ?? DEFAULT_WARDROBE.glasses),
		beanie: hipster,
		clubMate: hipster
	};
}

export function toggleHipster(current: DuckWardrobe): DuckWardrobe {
	return { ...current, hipster: !current.hipster };
}

const key = 'duck.wardrobe.v4';
export function readWardrobe(storage?: Pick<Storage, 'getItem'>): DuckWardrobe {
	const result = { ...DEFAULT_WARDROBE };
	try {
		const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(key) ?? 'null');
		for (const name of ['glasses', 'hipster'] as const)
			if (typeof saved?.[name] === 'boolean') result[name] = saved[name];
	} catch {
		/* Storage may be disabled or contain an older invalid record. */
	}
	return result;
}
export function saveWardrobe(value: DuckWardrobe, storage?: Pick<Storage, 'setItem'>): boolean {
	try {
		(storage ?? globalThis.localStorage).setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}
