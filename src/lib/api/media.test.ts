import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { registerHooks } from 'node:module';
import { after, before, test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('./') && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { loadTrustedImage, mediaRequestInit } = await import('./media.js');

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
let foreignHits = 0;
let foreign: Server;
let tutor: Server;

function origin(server: Server): string {
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

before(async () => {
	// The third party a redirect would hand the browser to: it must never see a request.
	foreign = createServer((_request, response) => {
		foreignHits += 1;
		response.writeHead(200, { 'content-type': 'image/svg+xml' }).end(SVG);
	});
	foreign.listen(0, '127.0.0.1');
	await once(foreign, 'listening');

	tutor = createServer((request, response) => {
		if (request.url === '/diagram.svg') {
			response.writeHead(200, { 'content-type': 'image/svg+xml' }).end(SVG);
		} else if (request.url === '/moved.svg') {
			response.writeHead(302, { location: `${origin(foreign)}/tracker.svg` }).end();
		} else if (request.url === '/page.html') {
			response.writeHead(200, { 'content-type': 'text/html' }).end('<p>no image</p>');
		} else {
			response.writeHead(404).end();
		}
	});
	tutor.listen(0, '127.0.0.1');
	await once(tutor, 'listening');
});

after(() => {
	foreign.close();
	tutor.close();
});

test('transcript images are fetched with redirect: error and same-origin credentials', async () => {
	const signal = new AbortController().signal;
	assert.deepEqual(mediaRequestInit(signal), {
		redirect: 'error',
		credentials: 'same-origin',
		signal
	});
	const seen: RequestInit[] = [];
	const blob = await loadTrustedImage('https://tutor.example/diagram.svg', signal, (_url, init) => {
		seen.push(init);
		return Promise.resolve(new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } }));
	});
	assert.equal(blob?.type, 'image/svg+xml');
	assert.equal(seen.length, 1);
	assert.equal(seen[0].redirect, 'error');
	assert.equal(seen[0].credentials, 'same-origin');
	assert.equal(seen[0].signal, signal);
});

test('a trusted image loads as a Blob from the tutor origin', async () => {
	const blob = await loadTrustedImage(`${origin(tutor)}/diagram.svg`);
	assert.equal(blob?.type, 'image/svg+xml');
	assert.equal(await blob?.text(), SVG);
});

test('a redirect to a third party is refused before any foreign request', async () => {
	foreignHits = 0;
	assert.equal(await loadTrustedImage(`${origin(tutor)}/moved.svg`), null);
	assert.equal(foreignHits, 0);
});

test('errors, non-images and aborted loads yield null', async () => {
	assert.equal(await loadTrustedImage(`${origin(tutor)}/missing.svg`), null);
	assert.equal(await loadTrustedImage(`${origin(tutor)}/page.html`), null);
	const controller = new AbortController();
	controller.abort();
	assert.equal(await loadTrustedImage(`${origin(tutor)}/diagram.svg`, controller.signal), null);
	const opaque = await loadTrustedImage('https://tutor.example/x.svg', undefined, () =>
		Promise.resolve(Response.redirect('https://other.example/x.svg', 302))
	);
	assert.equal(opaque, null);
});
