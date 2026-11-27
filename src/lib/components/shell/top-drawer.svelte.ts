import { createContext, untrack, type Snippet } from 'svelte';

interface Drawer {
	readonly sections: readonly Snippet[];
	readonly open: boolean;
	toggle(open: boolean): void;
	close(): void;
	registerSection(section: Snippet): () => void;
}
export const [topDrawer, setTopDrawer] = createContext<Drawer>();
export function provideTopDrawer() {
	let sections = $state.raw<Snippet[]>([]);
	let open = $state(false);
	return setTopDrawer({
		get sections() {
			return sections;
		},
		get open() {
			return open;
		},
		toggle(value) {
			open = value;
		},
		close() {
			open = false;
		},
		registerSection(section) {
			sections = untrack(() => [...sections, section]);
			return () => {
				sections = sections.filter((item) => item !== section);
			};
		}
	});
}
