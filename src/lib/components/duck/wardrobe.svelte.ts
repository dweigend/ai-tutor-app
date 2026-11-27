import { DEFAULT_WARDROBE, toggleHipster } from '$lib/figures';
import type { DuckWardrobe } from '$lib/figures';

/**
 * The look of the fullscreen duck on `/tutor`. The corner duck always wears the everyday look,
 * so in 3D and in the 2D still (rendered from the same GLB) it is the same figure on every
 * route. The hipster easter egg belongs to `/tutor` alone and lasts for this session only: it
 * survives route changes in this tab, never a reload, and is never stored.
 */
let current = $state.raw<DuckWardrobe>({ ...DEFAULT_WARDROBE });

export const duckWardrobe = {
	get current(): DuckWardrobe {
		return current;
	},
	/** Toggles the hipster look and returns whether it is now on. */
	toggleHipster(): boolean {
		current = toggleHipster(current);
		return current.hipster;
	}
};
