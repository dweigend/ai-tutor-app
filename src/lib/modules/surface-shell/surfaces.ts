export const SURFACE_COLORS = {
	paper: '#f4f1ea',
	white: '#ffffff',
	yellow: '#e8e4da',
	orange: '#e85d1a',
	crimson: '#b81444',
	ink: '#0a0a0a'
} as const;

export type Surface = keyof typeof SURFACE_COLORS;
