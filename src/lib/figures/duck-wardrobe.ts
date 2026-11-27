export const ACCESSORIES = {
	glasses: 'acc_glasses',
	campusOutfit: 'acc_campus_outfit',
	beanie: 'acc_beanie',
	clubMate: 'acc_club_mate'
} as const;
export type DuckAccessory = keyof typeof ACCESSORIES;
export type DuckWardrobe = Record<DuckAccessory, boolean>;
export const DEFAULT_WARDROBE: Readonly<DuckWardrobe> = Object.freeze({
	glasses: true,
	campusOutfit: false,
	beanie: false,
	clubMate: false
});
export const WARDROBE_PRESETS = {
	basic: { ...DEFAULT_WARDROBE, glasses: false },
	glasses: DEFAULT_WARDROBE,
	campus: { ...DEFAULT_WARDROBE, campusOutfit: true },
	break: { ...DEFAULT_WARDROBE, beanie: true, clubMate: true }
} satisfies Record<string, DuckWardrobe>;
export function toggleAccessory(current: DuckWardrobe, key: DuckAccessory): DuckWardrobe {
	return { ...current, [key]: !current[key] };
}
const key = 'duck.wardrobe.v3';
export function readWardrobe(storage?: Pick<Storage, 'getItem'>): DuckWardrobe {
	const result = { ...DEFAULT_WARDROBE };
	try {
		const saved = JSON.parse((storage ?? globalThis.localStorage).getItem(key) ?? 'null');
		for (const name of Object.keys(ACCESSORIES) as DuckAccessory[])
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
