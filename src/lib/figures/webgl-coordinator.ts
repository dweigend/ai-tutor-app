export type WebGLPriority = 'stage' | 'tile' | 'companion';
const ranks = { stage: 3, tile: 2, companion: 1 };
type Request = { priority: WebGLPriority; notify: (active: boolean) => void };
/** One live context. Revoke synchronously before granting, FIFO among equals. */
export function createWebGLCoordinator() {
	const requests = new Set<Request>();
	let owner: Request | undefined;
	function reconcile() {
		let next: Request | undefined;
		for (const request of requests)
			if (!next || ranks[request.priority] > ranks[next.priority]) next = request;
		if (owner === next) return;
		const previous = owner;
		owner = next;
		previous?.notify(false);
		if (owner === next) next?.notify(true);
	}
	return {
		request(priority: WebGLPriority, notify: Request['notify']) {
			const request = { priority, notify };
			requests.add(request);
			reconcile();
			if (owner !== request) notify(false);
			return () => {
				requests.delete(request);
				reconcile();
			};
		}
	};
}
export const webglCoordinator = createWebGLCoordinator();

/** Existing synchronous lab factories already display their sheet if allocation fails. */
export function createLabWithSlot<T extends { dispose(): void }>(create: () => T): T {
	let granted = false;
	const release = webglCoordinator.request('stage', (active) => {
		granted = active;
	});
	try {
		if (!granted) throw new Error('WebGL stage slot occupied');
		const scene = create();
		const dispose = scene.dispose.bind(scene);
		scene.dispose = () => {
			try {
				dispose();
			} finally {
				release();
			}
		};
		return scene;
	} catch (error) {
		release();
		throw error;
	}
}
