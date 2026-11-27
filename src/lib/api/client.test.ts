import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import type {
	AgentContextSnapshot,
	ApiProblem,
	ExerciseAttemptRequest,
	StreamEvent,
	TutorApiClient,
	TutorArtifact,
	TutorTurnRequest,
	WhiteboardSnapshot
} from './types.js';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.startsWith(new URL('../', import.meta.url).href) &&
			(specifier.startsWith('./') || specifier.startsWith('../')) &&
			specifier.endsWith('.js')
		) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { trustedMediaUrl } = await import('./media.js');
const {
	HttpTutorClient,
	MockTutorClient,
	createTutorApiClient,
	resolveTutorApiConfig,
	switchTutorApiMode,
	isTutorArtifact,
	ApiError,
	CHECK_RESULTS,
	countsAsMastery
} = await import('./index.js');
const { defaultFixtures, demoCourse, demoTask, demoTutorialId, demoCheckId } =
	await import('./defaultFixtures.js');
const { buildEditorialMockFixtures, exercises } = await import('../content/index.js');
const { conceptEvidence, resolveConceptStatus } =
	await import('../components/aktivitaet/mirror.js');
const { visibleInMode } = await import('../components/uebungen/stage-model.js');
hooks.deregister();

const options = { confirmationDelayMs: 25, tokenDelayMs: 0 };
const upstream = new MockTutorClient(defaultFixtures, options);
const editorial = new MockTutorClient(buildEditorialMockFixtures(), options);
const server = createServer((request, response) => {
	handleRequest(request, response).catch((error: unknown) => {
		if (response.destroyed) return;
		if (!response.headersSent && error instanceof ApiError) {
			sendJson(response, { problem: error.problem }, error.status ?? 500);
		} else {
			response.destroy();
		}
	});
});
let origin: string;

before(async () => {
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve()))
	);
});

function sendJson(response: ServerResponse, value: object, status = 200) {
	response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
}

async function readFixture<T>(request: IncomingMessage): Promise<T> {
	request.setEncoding('utf8');
	let raw = '';
	for await (const part of request) {
		assert.equal(typeof part, 'string');
		raw += part;
	}
	// This local test service only receives inputs constructed in these tests.
	return JSON.parse(raw);
}

function frame(event: StreamEvent): string {
	const { type, ...data } = event;
	return `event: ${type}\r\ndata: {"type":"${type}",\r\ndata: ${JSON.stringify(data).slice(1)}\r\n\r\n`;
}

async function writeFrame(response: ServerResponse, event: StreamEvent) {
	const bytes = Buffer.from(frame(event));
	for (const byte of bytes) {
		if (response.destroyed) return;
		response.write(Uint8Array.of(byte));
		await setImmediate();
	}
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
	const url = new URL(request.url ?? '/', origin);
	const { pathname } = url;
	if (pathname === '/api/v1/health') return sendJson(response, await upstream.health());
	if (pathname === '/api/v1/activity/mirror') {
		return sendJson(
			response,
			await upstream.getActivityMirror({
				courseId: url.searchParams.get('courseId') ?? '',
				courseVersion: url.searchParams.get('courseVersion') ?? ''
			})
		);
	}
	assert.equal(request.method, 'POST');
	assert.match(request.headers['content-type'] ?? '', /application\/json/);
	if (pathname === '/api/v1/exercises/evaluate') {
		const body = await readFixture<
			Parameters<TutorApiClient['checkTutorial']>[0] | ExerciseAttemptRequest
		>(request);
		const result =
			body.kind === 'exercise'
				? await (body.task.taskId.startsWith('a-bp-') ? editorial : upstream).evaluateExercise(body)
				: await upstream.checkTutorial(body);
		return sendJson(response, result);
	}

	const body = await readFixture<TutorTurnRequest>(request);
	if (pathname === '/api/v1/tutor/turn') return sendJson(response, await upstream.turn(body));
	if (pathname.startsWith('/invalid/')) {
		return sendInvalidResponse(pathname, body, response);
	}
	if (pathname.startsWith('/open/')) return writeOpenStream(pathname, body, response);

	assert.equal(pathname, '/api/v1/tutor/stream');
	assert.equal(request.headers.accept, 'text/event-stream');
	const controller = new AbortController();
	response.on('close', () => controller.abort());
	const events = upstream.streamTurn(body, controller.signal)[Symbol.asyncIterator]();
	try {
		const first = await events.next();
		if (!first.done && first.value.type === 'error') {
			const { problem } = first.value;
			const statuses: Partial<Record<ApiProblem['code'], number>> = {
				conflict: 409,
				invalid_input: 422,
				not_found: 404
			};
			const status = statuses[problem.code] ?? 503;
			return sendJson(response, { problem }, status);
		}
		response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
		response.write(': heartbeat\r\n\r\n');
		if (!first.done) await writeFrame(response, first.value);
		for (let next = await events.next(); !next.done; next = await events.next()) {
			await writeFrame(response, next.value);
		}
		response.end();
	} finally {
		await events.return?.();
	}
}

async function writeOpenStream(path: string, request: TutorTurnRequest, response: ServerResponse) {
	response.writeHead(200, { 'Content-Type': 'text/event-stream' });
	if (path.startsWith('/open/error/')) {
		const error = frame({
			type: 'error',
			problem: { code: 'conflict', message: 'Konflikt', retryable: false }
		});
		response.write(error + error);
		return;
	}
	const done = await new MockTutorClient().turn(request);
	if (done.message) response.write(frame({ type: 'delta', text: done.message.text }));
	response.write(frame({ type: 'done', response: done }).replaceAll('\r\n', '\r'));
}

async function sendInvalidResponse(
	path: string,
	request: TutorTurnRequest,
	response: ServerResponse
) {
	const done = await new MockTutorClient().turn(request);
	if (path.endsWith('/turn')) {
		return sendJson(response, { ...done, session: { ...done.session, revision: '1' } });
	}
	response.writeHead(200, { 'Content-Type': 'text/event-stream' });
	if (path.startsWith('/invalid/truncated/'))
		return response.end('event: delta\ndata: {"type":"delta","text":"ä"}\n\n');
	if (path.startsWith('/invalid/names/'))
		return response.end('event: done\ndata: {"type":"delta","text":"ä"}\n\n');
	if (path.startsWith('/invalid/encoding/')) return response.end(Uint8Array.of(0xff));
	const terminal = frame({ type: 'done', response: done });
	return response.end(frame({ type: 'delta', text: 'Anderer Text.' }) + terminal);
}

function turn(
	sessionId: string,
	expectedRevision: number,
	input: TutorTurnRequest['input'],
	suffix = ''
): TutorTurnRequest {
	return {
		task: demoTask,
		sessionId,
		expectedRevision,
		requestId: `${sessionId}:${expectedRevision}${suffix}`,
		input
	};
}

async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
	const events: StreamEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

function assertProblem(error: unknown, code: string, status?: number): boolean {
	assert.ok(error instanceof ApiError);
	assert.equal(error.problem.code, code);
	if (status !== undefined) assert.equal(error.status, status);
	return true;
}

for (const mode of ['mock', 'http'] as const) {
	const client = () =>
		mode === 'mock' ? new MockTutorClient(defaultFixtures, options) : new HttpTutorClient(origin);

	test(`${mode}: Revision, Diagnose, SSE-Text, Warten und Wiederholung`, async () => {
		const api = client();
		const start = turn(`${mode}-turn`, 0, { kind: 'message', text: 'Wie beginne ich?' });
		const first = await api.turn(start);
		assert.equal(first.session.revision, 1);
		assert.equal(first.message?.move, 'vorhersage_verlangen');
		assert.equal(first.session.state.attempts, 0);

		const answer = turn(start.sessionId, 1, {
			kind: 'answer',
			text: 'Ich addiere die Abweichungen.'
		});
		const events = await collect(api.streamTurn(answer));
		const done = events.at(-1);
		assert.equal(done?.type, 'done');
		assert.equal(done.response.session.revision, 2);
		assert.equal(done.response.session.state.attempts, 1);
		assert.equal(done.response.session.state.hintsRemaining, 2);
		assert.equal(done.response.message?.move, 'gestufter_hinweis');
		assert.equal(
			events.flatMap((event) => (event.type === 'delta' ? [event.text] : [])).join(''),
			done.response.message?.text
		);
		assert.equal(
			await api.turn(answer).then((reply) => reply.message?.text),
			done.response.message?.text
		);

		const different = { ...answer, input: { kind: 'message', text: 'Geändert.' } } as const;
		await assert.rejects(api.turn(different), (error: unknown) =>
			assertProblem(error, 'conflict', 409)
		);
		const stale = await collect(api.streamTurn({ ...answer, requestId: `${mode}-stale` }));
		assert.equal(stale.length, 1);
		assert.equal(stale[0]?.type, 'error');
		assert.equal(stale[0].problem.code, 'conflict');

		await api.turn(turn(start.sessionId, 2, { kind: 'answer', text: 'Ich quadriere sie.' }));
		const wait = await collect(
			api.streamTurn(turn(start.sessionId, 3, { kind: 'message', text: 'Ich rechne kurz.' }))
		);
		assert.equal(wait.length, 1);
		assert.equal(wait[0]?.type, 'done');
		assert.equal(wait[0].response.outcome, 'wait');
		assert.equal(wait[0].response.message, null);
		assert.deepEqual(await api.health(), { status: 'ok', apiVersion: 'v1' });
	});

	test(`${mode}: Whiteboard-Abgabe, Wiederholung und Konflikte`, async () => {
		const api = client();
		const session = `${mode}-board`;
		const snapshot: WhiteboardSnapshot = {
			boardId: 'graph',
			revision: 2,
			strokes: [
				{
					points: [
						{ x: 0, y: 1 },
						{ x: 0.8, y: 0.2 }
					]
				}
			]
		};
		const request = (revision: number, drawing: WhiteboardSnapshot) =>
			turn(session, revision, { kind: 'whiteboard', snapshot: drawing });
		const submit = request(0, snapshot);
		const first = await api.turn(submit);
		assert.deepEqual(first.learnerMessage?.attachment, { boardId: 'graph', revision: 2 });
		assert.equal(first.learnerMessage?.text, '');
		assert.equal(first.session.state.attempts, 1);
		assert.deepEqual(await api.turn(submit), first);
		assert.equal((await api.turn(request(1, snapshot))).session.state.attempts, 1);

		for (const changed of [
			{ ...snapshot, revision: 1 },
			{ ...snapshot, boardId: 'other' },
			{ ...snapshot, strokes: [{ points: [{ x: 0.1, y: 0.2 }] }] }
		]) {
			await assert.rejects(api.turn(request(2, changed)), (error: unknown) =>
				assertProblem(error, 'conflict', 409)
			);
		}
		for (const strokes of [
			[],
			[{ points: [{ x: 1.1, y: 0 }] }],
			[{ points: Array.from({ length: 5001 }, () => ({ x: 1, y: 0 })) }]
		]) {
			await assert.rejects(api.turn(request(2, { ...snapshot, strokes })), (error: unknown) =>
				assertProblem(error, 'invalid_input', 422)
			);
		}
		assert.equal(
			(await api.turn(request(2, { ...snapshot, revision: 3 }))).session.state.attempts,
			2
		);
	});

	test(`${mode}: Übungen und Tutorial aktualisieren den Spiegel genau einmal`, async () => {
		const api = client();
		const request: ExerciseAttemptRequest = {
			kind: 'exercise',
			task: demoTask,
			requestId: `${mode}-correct`,
			answer: { kind: 'choice', optionIds: ['2x'] }
		};
		const result = await api.evaluateExercise(request);
		assert.equal(result.result, 'korrekt');
		assert.equal(result.evidence.length, 1);
		assert.deepEqual(await api.evaluateExercise(request), result);
		await assert.rejects(
			api.evaluateExercise({ ...request, answer: { kind: 'choice', optionIds: ['other'] } }),
			(error: unknown) => assertProblem(error, 'conflict', 409)
		);
		const partial = await api.evaluateExercise({
			...request,
			requestId: `${mode}-partial`,
			answer: { kind: 'text', text: '0,11' }
		});
		assert.equal(partial.result, 'teilweise');
		assert.deepEqual(partial.evidence, []);

		const tutorial = await api.checkTutorial({
			kind: 'tutorial',
			course: demoCourse,
			requestId: `${mode}-tutorial`,
			tutorialId: demoTutorialId,
			checkId: demoCheckId,
			answer: { kind: 'choice', optionIds: ['steiler'] }
		});
		assert.equal(tutorial.result, 'falsch');
		const mirror = await api.getActivityMirror(demoCourse);
		assert.deepEqual(mirror.evidence, result.evidence);
		assert.deepEqual(
			mirror.recentPractice.map(({ kind, result }) => [kind, result]),
			[
				['tutorial', 'falsch'],
				['exercise', 'teilweise'],
				['exercise', 'korrekt']
			]
		);
		const empty = await api.getActivityMirror({ ...demoCourse, courseVersion: 'andere' });
		assert.deepEqual(empty.recentPractice, []);
		assert.deepEqual(empty.evidence, []);
	});

	test(`${mode}: Abort vor und nach Bestätigung`, async () => {
		const api = client();
		const request = turn(`${mode}-abort`, 0, { kind: 'answer', text: 'Mein erster Versuch.' });
		const before = new AbortController();
		const discarded = { ...request, requestId: `${mode}-discarded` };
		const started = collect(api.streamTurn(discarded, before.signal));
		before.abort('Abbruch');
		await assert.rejects(started, { name: 'AbortError' });

		const after = new AbortController();
		const stream = api.streamTurn(request, after.signal)[Symbol.asyncIterator]();
		assert.equal((await stream.next()).value.type, 'delta');
		after.abort();
		await assert.rejects(stream.next(), { name: 'AbortError' });
		const confirmed = await api.turn(request);
		assert.equal(confirmed.session.revision, 1);
		assert.equal(confirmed.session.state.attempts, 1);
		const followup = await api.turn(turn(request.sessionId, 1, { kind: 'explain' }));
		assert.equal(followup.learnerMessage, null);
		assert.equal(followup.message?.move, 'beispiel_zeigen');
	});
}

test('Mock: nach einem erklärenden Beispiel folgt eine Frage zum eigenen Schritt', async () => {
	const client = new MockTutorClient(defaultFixtures, options);
	const sessionId = 'return-after-example';
	await client.turn(turn(sessionId, 0, { kind: 'explain' }));
	const back = await client.turn(turn(sessionId, 1, { kind: 'message', text: 'Verstanden.' }));
	const next = await client.turn(
		turn(sessionId, 2, { kind: 'answer', text: 'Ich tippe auf y = 2x.' })
	);
	assert.equal(back.message?.move, 'nachhaken');
	assert.match(back.message?.text ?? '', /dein nächster Schritt/);
	assert.notEqual(back.message?.text, next.message?.text);

	const diagnosedSession = 'diagnosis-after-example';
	await client.turn(turn(diagnosedSession, 0, { kind: 'message', text: 'Hallo.' }));
	await client.turn(turn(diagnosedSession, 1, { kind: 'explain' }));
	const diagnosis = await client.turn(
		turn(diagnosedSession, 2, { kind: 'answer', text: 'Ich addiere die Abweichungen.' })
	);
	assert.equal(diagnosis.message?.move, 'gestufter_hinweis');
});

test('Mock: falsche Einzelauswahl erhält das Feedback der gewählten Option', async () => {
	const [fixture] = defaultFixtures.exercises;
	const diagnostic = 'Prüfe die Messpunkte oberhalb der gewählten Geraden.';
	const client = new MockTutorClient(
		{
			...defaultFixtures,
			exercises: [{ ...fixture, optionFeedback: { '3x': diagnostic, '2x': 'Andere Rückmeldung.' } }]
		},
		options
	);

	for (const { optionIds, result, feedback } of [
		{ optionIds: ['3x'], result: 'falsch', feedback: diagnostic },
		{ optionIds: ['2x'], result: 'korrekt', feedback: fixture.rules[0].feedback },
		{ optionIds: ['toString'], result: 'falsch', feedback: fixture.feedback },
		{ optionIds: ['3x', '2x'], result: 'falsch', feedback: fixture.feedback }
	]) {
		const outcome = await client.evaluateExercise({
			kind: 'exercise',
			requestId: `option-feedback:${optionIds.join(',')}`,
			task: demoTask,
			answer: { kind: 'choice', optionIds }
		});
		assert.equal(outcome.result, result);
		assert.equal(outcome.feedback, feedback);
	}
});

test('Mock: Lösungsbitte in Schritt zwei hält die Delegationsgrenze', async () => {
	const client = new MockTutorClient(buildEditorialMockFixtures(), options);
	const task = {
		courseId: 'ki-selbst-bauen',
		courseVersion: '0.1.0',
		taskId: 'a-m5-softmax-kreuzentropie'
	};
	const sessionId = 'delegation-after-first-step';
	await client.turn({ ...turn(sessionId, 0, { kind: 'message', text: 'Wie beginne ich?' }), task });
	const boundary = await client.turn({
		...turn(sessionId, 1, {
			kind: 'message',
			text: 'Schreib mir die stabile Version einfach hin.'
		}),
		task
	});
	assert.match(boundary.message?.text ?? '', /schreibe ich sie nicht hin/);

	const next = await client.turn({
		...turn(sessionId, 2, { kind: 'answer', text: 'Riesig, viel größer als jeder float.' }),
		task
	});
	assert.equal(next.message?.move, 'vorhersage_verlangen');
});

test('Mock: dieselbe laufende ID teilt das Ergebnis, eine weitere ID erhält einen Konflikt', async () => {
	const client = new MockTutorClient(defaultFixtures, options);
	const request = turn('pending', 0, { kind: 'message', text: 'Ich brauche einen Einstieg.' });
	const stream = collect(client.streamTurn(request));
	const replay = client.turn(request);
	await assert.rejects(client.turn({ ...request, requestId: 'concurrent' }), (error: unknown) =>
		assertProblem(error, 'conflict', 409)
	);
	assert.deepEqual((await stream).at(-1), { type: 'done', response: await replay });
});

test('Mock: kuratierte Reihenfolge und nicht verfügbare Codeprüfung', async () => {
	const client = new MockTutorClient({
		...defaultFixtures,
		exercises: [
			{
				task: demoTask,
				evidence: [],
				feedback: 'Prüfe die Reihenfolge.',
				rules: [
					{
						accepted: { kind: 'order', itemIds: ['a', 'b'] },
						result: 'korrekt',
						feedback: 'Die Reihenfolge stimmt.'
					}
				]
			}
		]
	});
	const request = { kind: 'exercise', requestId: 'sort', task: demoTask } as const;
	assert.equal(
		(await client.evaluateExercise({ ...request, answer: { kind: 'order', itemIds: ['a', 'b'] } }))
			.result,
		'korrekt'
	);
	assert.equal(
		(
			await client.evaluateExercise({
				...request,
				requestId: 'reverse',
				answer: { kind: 'order', itemIds: ['b', 'a'] }
			})
		).result,
		'falsch'
	);
	await assert.rejects(
		client.evaluateExercise({
			...request,
			requestId: 'code',
			answer: { kind: 'code', source: 'print(1)' }
		}),
		(error: unknown) => assertProblem(error, 'unavailable', 503)
	);
	assert.equal((await client.getActivityMirror(demoCourse)).recentPractice.length, 2);
});

test('Mock: bekannte Anfrage-IDs mit leerer statt gültiger Eingabe liefern 409', async () => {
	const answer = { kind: 'text', text: 'ok' } as const;
	const client = new MockTutorClient(
		{
			...defaultFixtures,
			tutorials: defaultFixtures.tutorials.map((fixture) => ({
				...fixture,
				rules: [{ accepted: answer, result: 'korrekt', feedback: 'Richtig.' }]
			}))
		},
		options
	);
	const request = turn('empty-replay', 0, { kind: 'message', text: 'ok' });
	const emptyTurn = { ...request, input: { kind: 'message', text: ' ' } } as const;
	const pending = collect(client.streamTurn(request));
	const isConflict = (error: unknown) => assertProblem(error, 'conflict', 409);
	await assert.rejects(client.turn(emptyTurn), isConflict);
	assert.equal((await pending).at(-1)?.type, 'done');
	await assert.rejects(client.turn(emptyTurn), isConflict);

	const emptyAnswer = { ...answer, text: ' ' };
	const tutorial = {
		kind: 'tutorial',
		course: demoCourse,
		tutorialId: demoTutorialId,
		checkId: demoCheckId,
		requestId: 'tutorial-empty-replay',
		answer
	} as const;
	const exercise = {
		kind: 'exercise',
		task: demoTask,
		requestId: 'exercise-empty-replay',
		answer
	} as const;
	await client.checkTutorial(tutorial);
	await client.evaluateExercise(exercise);
	await assert.rejects(client.checkTutorial({ ...tutorial, answer: emptyAnswer }), isConflict);
	await assert.rejects(client.evaluateExercise({ ...exercise, answer: emptyAnswer }), isConflict);
});

test('HTTP: SSE endet nach done oder error bei offener Serververbindung', async () => {
	const request = turn('open-stream', 0, { kind: 'message', text: 'Hallo' });
	for (const terminal of ['done', 'error'] as const) {
		const client = new HttpTutorClient(`${origin}/open/${terminal}`);
		const signal = AbortSignal.timeout(2000);
		const closed = new Promise<void>((resolve) => {
			server.once('request', (_request, response) => response.once('close', resolve));
		});
		const events = await collect(client.streamTurn(request, signal));
		const last = events.at(-1);
		assert.equal(last?.type, terminal);
		if (last.type === 'error') assert.equal(last.problem.code, 'conflict');
		assert.ok(events.slice(0, -1).every((event) => event.type === 'delta'));
		await closed;
		assert.equal(signal.aborted, false);
	}
});

test('HTTP: JSON- und SSE-Antworten werden gegen den versendeten Request geprüft', async () => {
	const client = new HttpTutorClient(origin);
	const jsonRequest = turn('snapshot-json', 0, { kind: 'message', text: 'Hallo' });
	const response = client.turn(jsonRequest);
	jsonRequest.expectedRevision = 8;
	assert.equal((await response).session.revision, 1);

	const streamRequest = turn('snapshot-sse', 0, { kind: 'message', text: 'Hallo' });
	const events = collect(client.streamTurn(streamRequest));
	streamRequest.expectedRevision = 8;
	const last = (await events).at(-1);
	assert.equal(last?.type, 'done');
	assert.equal(last.response.session.revision, 1);

	const tutorialReq = {
		kind: 'tutorial' as const,
		requestId: 'snapshot-tut',
		course: { ...demoCourse },
		tutorialId: demoTutorialId,
		checkId: demoCheckId,
		answer: { kind: 'choice' as const, optionIds: ['spitzer'] }
	};
	const tutRes = client.checkTutorial(tutorialReq);
	tutorialReq.requestId = 'mutated-tut';
	assert.equal((await tutRes).requestId, 'snapshot-tut');

	const exerciseReq = {
		kind: 'exercise' as const,
		requestId: 'snapshot-ex',
		task: { ...demoTask },
		answer: { kind: 'choice' as const, optionIds: ['vorzeichen'] }
	};
	const exRes = client.evaluateExercise(exerciseReq);
	exerciseReq.requestId = 'mutated-ex';
	exerciseReq.task.taskId = 'mutated-task';
	assert.equal((await exRes).requestId, 'snapshot-ex');

	const mirrorCourse = { ...demoCourse };
	const mirrorRes = client.getActivityMirror(mirrorCourse);
	mirrorCourse.courseId = 'mutated-course';
	assert.equal((await mirrorRes).course.courseId, demoCourse.courseId);
});

test('HTTP: Übungsbelege gehören zum Versuch oder stammen aus einem Altbestand', async () => {
	const request: ExerciseAttemptRequest = {
		kind: 'exercise',
		requestId: 'exercise-evidence-attempt',
		task: demoTask,
		answer: { kind: 'choice', optionIds: ['2x'] }
	};
	const result = await upstream.evaluateExercise(request);
	const [evidence] = result.evidence;
	assert.ok(evidence);

	const foreignClient = new HttpTutorClient('/', async () =>
		Response.json({ ...result, evidence: [{ ...evidence, attemptId: 'foreign-attempt' }] })
	);
	await assert.rejects(foreignClient.evaluateExercise(request), (error: unknown) =>
		assertProblem(error, 'protocol')
	);

	const legacyClient = new HttpTutorClient('/', async () =>
		Response.json({ ...result, evidence: [{ ...evidence, attemptId: undefined }] })
	);
	const legacyResult = await legacyClient.evaluateExercise(request);
	assert.equal(legacyResult.evidence.length, 1);
	assert.equal(legacyResult.evidence[0]?.attemptId, undefined);
});

test('Vertrag: der 4. Evidenzzustand ist gültig, aber nie Meisterschaft', async () => {
	assert.deepEqual(
		[...CHECK_RESULTS],
		['korrekt', 'teilweise', 'falsch', 'nicht_pruefbar_oder_alternativweg']
	);
	assert.deepEqual(
		CHECK_RESULTS.filter((result) => countsAsMastery(result)),
		['korrekt']
	);

	const request: ExerciseAttemptRequest = {
		kind: 'exercise',
		requestId: 'exercise-alternative-way',
		task: demoTask,
		answer: { kind: 'choice', optionIds: ['2x'] }
	};
	const received = {
		kind: 'exercise',
		requestId: request.requestId,
		attemptId: 'attempt-alternative',
		result: 'nicht_pruefbar_oder_alternativweg',
		feedback: 'Eingereicht. Vergleiche deinen Weg mit der Musterlösung.',
		evidence: []
	};
	const client = new HttpTutorClient('/', async () => Response.json(received));
	const result = await client.evaluateExercise(request);
	assert.equal(result.result, 'nicht_pruefbar_oder_alternativweg');
	assert.deepEqual(result.evidence, []);

	// Learning evidence on a result that is not mastery breaks the contract.
	const evidence = {
		id: 'ev-1',
		attemptId: 'attempt-alternative',
		taskId: demoTask.taskId,
		learningGoalId: 'lz-lernen-als-optimierung-erklaeren',
		kind: 'anwendung',
		helpLevel: 0,
		recordedAt: '2026-11-27T10:00:00.000Z'
	};
	const claiming = new HttpTutorClient('/', async () =>
		Response.json({ ...received, evidence: [evidence] })
	);
	await assert.rejects(claiming.evaluateExercise(request), (error: unknown) =>
		assertProblem(error, 'protocol')
	);
});

test('Konfiguration: Same-Origin-Client nutzt den injizierten Fetcher', async () => {
	const paths: string[] = [];
	const fetcher: typeof fetch = async (path) => {
		paths.push(String(path));
		return Response.json({ status: 'ok', apiVersion: 'v1' });
	};
	const client = createTutorApiClient({ mode: 'http', baseUrl: '/' }, undefined, fetcher);
	assert.deepEqual(await client.health(), { status: 'ok', apiVersion: 'v1' });
	assert.deepEqual(paths, ['/api/v1/health']);
});

test('HTTP: falsche DTOs und beschädigte oder unvollständige Streams werden abgewiesen', async () => {
	const request = turn('invalid', 0, { kind: 'message', text: 'Hallo' });
	const json = new HttpTutorClient(`${origin}/invalid/json`);
	await assert.rejects(json.turn(request), (error: unknown) => assertProblem(error, 'protocol'));
	for (const failure of ['truncated', 'names', 'encoding', 'mismatch']) {
		const client = new HttpTutorClient(`${origin}/invalid/${failure}`);
		const events = await collect(client.streamTurn(request));
		const last = events.at(-1);
		assert.equal(last?.type, 'error', failure);
		assert.equal(last.problem.code, 'protocol', failure);
		assert.ok(
			events.slice(0, -1).every((event) => event.type === 'delta'),
			failure
		);
	}
});

test('Konfiguration: Laufzeitdatei, Build-Wert, Demo und expliziter Moduswechsel', async () => {
	const mockConfig = { mode: 'mock' } as const;
	const liveConfig = { mode: 'http', baseUrl: 'https://tutor.example' } as const;
	const missing = async () => new Response(null, { status: 404 });
	assert.deepEqual(
		await resolveTutorApiConfig({
			fetcher: async () => Response.json(mockConfig),
			buildApiUrl: liveConfig.baseUrl
		}),
		mockConfig
	);
	assert.deepEqual(
		await resolveTutorApiConfig({ fetcher: missing, buildApiUrl: liveConfig.baseUrl }),
		liveConfig
	);
	assert.deepEqual(await resolveTutorApiConfig({ fetcher: missing, buildApiUrl: '' }), mockConfig);
	await assert.rejects(
		resolveTutorApiConfig({
			fetcher: async () => new Response(null, { status: 503 }),
			buildApiUrl: ''
		}),
		(error: unknown) => assertProblem(error, 'protocol', 503)
	);
	const live = { config: liveConfig, client: createTutorApiClient(liveConfig) };
	const demo = switchTutorApiMode(live, 'mock');
	assert.ok(demo.client instanceof MockTutorClient);
	assert.equal(switchTutorApiMode(demo, 'mock'), demo);
	assert.deepEqual(switchTutorApiMode(demo, 'http').config, liveConfig);
});

test('Mock: Katalog-Tutorial schreibt Lernziel-Beleg und Whiteboard-Aufgabe bietet Selbstprüfung', async () => {
	const client = new MockTutorClient(buildEditorialMockFixtures());
	const course = { courseId: 'ki-selbst-bauen', courseVersion: '0.1.0' };
	const sketchTask = { ...course, taskId: 'a-bp-skizze-rechengraph' };

	const tut = await client.checkTutorial({
		kind: 'tutorial',
		requestId: 'tut-ev-1',
		course,
		tutorialId: 'attention-skalierung',
		checkId: 'gewicht-vorhersagen',
		answer: { kind: 'choice', optionIds: ['flacher'] }
	});
	assert.equal(tut.result, 'korrekt');

	const strokes = [
		{ points: [{ x: 0.1, y: 0.2 }] },
		{ points: [{ x: 0.4, y: 0.5 }] },
		{ points: [{ x: 0.7, y: 0.8 }] }
	];
	// Fourth evidence state: a sketch is received, not judged. Neither partial nor mastery.
	for (const count of [2, 3]) {
		const outcome = await client.evaluateExercise({
			kind: 'exercise',
			requestId: `wb-ex-${count}`,
			task: sketchTask,
			answer: {
				kind: 'whiteboard',
				snapshot: { boardId: 'board-user', revision: count, strokes: strokes.slice(0, count) }
			}
		});
		assert.equal(outcome.result, 'nicht_pruefbar_oder_alternativweg');
		assert.notEqual(outcome.result, 'teilweise');
		assert.equal(countsAsMastery(outcome.result), false);
		assert.deepEqual(outcome.evidence, []);
		assert.match(
			outcome.feedback,
			/Prüfe selbst: Sind e = a · b, d = e \+ c und beide Pfade von d zu L eingezeichnet/
		);
	}

	const mirror = await client.getActivityMirror(course);
	assert.ok(mirror.evidence.every((item) => item.taskId !== sketchTask.taskId));
	const sketchPractice = mirror.recentPractice.filter((item) => item.itemId === sketchTask.taskId);
	assert.equal(sketchPractice.length, 2);
	assert.ok(sketchPractice.every((item) => item.result === 'nicht_pruefbar_oder_alternativweg'));
	const tutEvidence = mirror.evidence.find((item) => item.attemptId === 'tut-ev-1');
	assert.equal(tutEvidence?.helpLevel, 0);
	assert.equal(tutEvidence?.taskId, 'attention-skalierung');
	assert.equal(tutEvidence?.learningGoalId, 'lz-softmax-kreuzentropie-erklaeren');
});

test('transcript media loads only from the app or configured tutor origin', () => {
	const app = 'https://app.example';
	const config = { mode: 'http', baseUrl: 'https://tutor.example/base' } as const;
	assert.equal(trustedMediaUrl('/diagram.svg', app, config), app + '/diagram.svg');
	assert.equal(
		trustedMediaUrl('https://tutor.example/diagram.svg', app, config),
		'https://tutor.example/diagram.svg'
	);
	for (const url of [
		'https://other.example/diagram.svg',
		'//other.example/diagram.svg',
		'https://tutor.example:9999/diagram.svg',
		'https://user@tutor.example/diagram.svg',
		'data:image/svg+xml,...'
	]) {
		assert.equal(trustedMediaUrl(url, app, config), null);
	}
	assert.equal(trustedMediaUrl('https://tutor.example/diagram.svg', app, { mode: 'mock' }), null);
});

const attentionContext: AgentContextSnapshot = {
	visibleScreen: {
		route: '/erklaerungen',
		topic: 'attention',
		sectionTitle: 'Warum durch die Wurzel teilen?',
		formulaId: 'attention-scaled',
		termId: 'attention-scale',
		termLabel: '√dₖ',
		isIndependentProbe: false,
		updatedAt: 100
	},
	recentHistory: [
		{
			id: 'attention',
			route: '/erklaerungen',
			kind: 'explanation',
			depth: 0.4,
			lastVisitedAt: 100,
			visits: 1
		}
	],
	dwellStats: [{ id: 'attention', route: '/erklaerungen', activeSeconds: 42 }],
	inferredInterests: [],
	savedNotesAndQuestions: [
		{
			id: 'question',
			route: '/magazin/attention',
			kind: 'question',
			text: 'Was wird beim Skalieren kleiner?',
			topic: 'attention',
			createdAt: 10
		}
	],
	capturedAt: 100
};

test('Mock: sichtbarer Kontext, Lernspur und Karte erst in der bestätigten Antwort', async () => {
	const api = new MockTutorClient(defaultFixtures, options);
	const request = {
		...turn('contextual', 0, { kind: 'message', text: 'Zeig mir die Formel.' }),
		agentContext: attentionContext
	};
	const events = await collect(api.streamTurn(request));
	const done = events.at(-1);
	assert.ok(done?.type === 'done');
	assert.equal(done.response.artifact?.kind, 'formula');
	assert.ok(isTutorArtifact(done.response.artifact));
	assert.match(
		done.response.message?.text ?? '',
		/Warum durch die Wurzel.*√dₖ.*42 Sekunden.*Was wird beim Skalieren kleiner/
	);
	assert.equal(done.response.message?.move, 'vorhersage_verlangen');
	for (const event of events.slice(0, -1)) {
		assert.equal(event.type, 'delta');
		assert.deepEqual(Object.keys(event).sort(), ['text', 'type']);
	}
	assert.deepEqual(await api.turn(request), done.response);
	const changed = {
		...request,
		agentContext: { ...attentionContext, capturedAt: 101 }
	};
	await assert.rejects(api.turn(changed), (error: unknown) =>
		assertProblem(error, 'conflict', 409)
	);
	const stale = await collect(api.streamTurn({ ...request, requestId: 'stale-card' }));
	assert.equal(stale[0]?.type, 'error');
});

test('Mock: Code-, Skizzen- und Fragekarten bleiben Beispiele und überstehen Abbruchregeln', async () => {
	const api = new MockTutorClient(defaultFixtures, options);
	const codeRequest = turn('code-card', 0, {
		kind: 'message',
		text: 'Hast du ein Beispiel mit Python-Code?'
	});
	const abort = new AbortController();
	const stream = api.streamTurn(codeRequest, abort.signal)[Symbol.asyncIterator]();
	const opening = stream.next();
	abort.abort();
	await assert.rejects(opening, { name: 'AbortError' });
	const code = await api.turn(codeRequest);
	assert.equal(code.session.revision, 1);
	assert.ok(code.artifact?.kind === 'code');
	assert.ok(isTutorArtifact(code.artifact));
	assert.doesNotMatch(code.artifact.code, /2x|0.022/);

	const sketch = await api.turn(
		turn('sketch-card', 0, { kind: 'message', text: 'Zeigst du mir eine Skizze?' })
	);
	assert.equal(sketch.artifact?.kind, 'sketch');
	assert.ok(isTutorArtifact(sketch.artifact));
	const question = await api.turn(
		turn('question-card', 0, { kind: 'message', text: 'Hast du eine Rückfrage?' })
	);
	assert.equal(question.artifact?.kind, 'question');
	assert.ok(isTutorArtifact(question.artifact));
});

test('Mock und HTTP: Probenregel sperrt Karten, Lernspur und Live-Anfrage', async () => {
	const mock = new MockTutorClient(defaultFixtures, options);
	const http = new HttpTutorClient(
		'/',
		() => {
			assert.fail('Protected probe turn must never reach fetch');
		},
		{ shareWithApi: true }
	);
	const probe = {
		...turn('protected-context', 0, { kind: 'message', text: 'Formel, Skizze und Code bitte' }),
		agentContext: {
			...attentionContext,
			visibleScreen: {
				...attentionContext.visibleScreen,
				isIndependentProbe: true,
				exerciseState: { revealed: true, answerSelected: '1,92' }
			}
		}
	};
	const response = await mock.turn(probe);
	assert.equal(response.artifact, undefined);
	assert.match(response.message?.text ?? '', /eigenständig.*abschließt oder bewusst verlässt/);
	assert.doesNotMatch(response.message?.text ?? '', /Wurzel|Sekunden|Skalieren|1,92/);
	assert.equal(response.session.state.hintsRemaining, 0);
	assert.equal(response.session.state.explanationAvailable, false);
	await assert.rejects(http.turn(probe), (error: unknown) => assertProblem(error, 'unavailable'));
	assert.equal((await collect(http.streamTurn(probe)))[0].type, 'error');

	const knownProbeWithoutContext = {
		...turn('known-probe', 0, { kind: 'explain' }),
		task: { ...demoTask, taskId: 'a-gd-lernrate-auswahl' }
	};
	assert.equal((await mock.turn(knownProbeWithoutContext)).message?.text, response.message?.text);
	await assert.rejects(http.turn(knownProbeWithoutContext), (error: unknown) =>
		assertProblem(error, 'unavailable')
	);
});

test('HTTP: sendet den Snapshot nur bei Opt-in, für JSON und SSE', async () => {
	const api = new MockTutorClient(defaultFixtures, options);
	const request = {
		...turn('privacy-json', 0, { kind: 'message', text: 'Formel bitte' }),
		agentContext: attentionContext
	};
	const bodies: TutorTurnRequest[] = [];
	const fetcher: typeof fetch = async (url, init) => {
		const payload = init?.body;
		assert.ok(typeof payload === 'string');
		const body: TutorTurnRequest = JSON.parse(payload);
		bodies.push(body);
		const response = await api.turn(body);
		if (String(url).endsWith('/tutor/turn')) return Response.json(response);
		return new Response(
			[
				frame({ type: 'delta', text: response.message?.text ?? '' }),
				frame({ type: 'done', response })
			].join(''),
			{ headers: { 'Content-Type': 'text/event-stream' } }
		);
	};
	const local = new HttpTutorClient('/', fetcher);
	const shared = createTutorApiClient(
		{ mode: 'http', baseUrl: '/', shareWithApi: true },
		undefined,
		fetcher
	);
	assert.equal((await local.turn(request)).artifact?.kind, 'formula');
	assert.equal(Object.hasOwn(bodies[0], 'agentContext'), false);

	const sharedRequest = { ...request, sessionId: 'privacy-stream', requestId: 'privacy-stream' };
	const result = (await collect(shared.streamTurn(sharedRequest))).at(-1);
	assert.ok(result?.type === 'done');
	assert.deepEqual(bodies[1].agentContext, attentionContext);
	assert.equal(result.response.artifact?.title, 'Skalierte Attention');

	const withoutContext = turn('privacy-legacy', 0, { kind: 'message', text: 'Wie beginne ich?' });
	assert.equal((await shared.turn(withoutContext)).artifact, undefined);
	assert.equal(Object.hasOwn(bodies[2], 'agentContext'), false);
});

test('HTTP: validiert jede Kartenvariante und lehnt beschädigte JSON-/SSE-Karten ab', async () => {
	const request = turn('artifact-validation', 0, { kind: 'message', text: 'Start' });
	const reply = await new MockTutorClient(defaultFixtures, options).turn(request);
	const header = { id: 'card', title: 'Beispiel' };
	const valid: TutorArtifact[] = [
		{ ...header, kind: 'formula', latex: 'x^2', spoken: 'x Quadrat' },
		{ ...header, kind: 'code', language: 'python', code: 'x = 2' },
		{ ...header, kind: 'sketch', points: [[{ x: 0.1, y: 1 }]] },
		{ ...header, kind: 'question', prompt: 'Wo beginnst du?', choices: ['Hier', 'Dort'] }
	];
	const invalid = [
		{ ...valid[0], spoken: undefined },
		{ ...valid[1], code: [] },
		{ ...valid[2], points: [[{ x: -1, y: 0 }]] },
		{ ...valid[2], points: [[{ x: Infinity, y: 0 }]] },
		{ ...valid[2], points: [[]] },
		{ ...valid[2], points: [Array.from({ length: 5001 }, () => ({ x: 0, y: 0 }))] },
		{ ...valid[3], choices: [2] },
		{ ...header, kind: 'image' }
	];
	const jsonClient = (artifact: unknown) =>
		new HttpTutorClient('/', async () => Response.json({ ...reply, artifact }));
	for (const artifact of valid) {
		assert.ok(isTutorArtifact(artifact));
		assert.deepEqual((await jsonClient(artifact).turn(request)).artifact, artifact);
	}
	for (const artifact of invalid) {
		assert.equal(isTutorArtifact(artifact), false);
		await assert.rejects(jsonClient(artifact).turn(request), (error: unknown) =>
			assertProblem(error, 'protocol')
		);
	}
	const malformed = `event: done\ndata: ${JSON.stringify({ type: 'done', response: { ...reply, artifact: invalid[2] } })}\n\n`;
	const sse = new HttpTutorClient(
		'/',
		async () =>
			new Response(frame({ type: 'delta', text: reply.message?.text ?? '' }) + malformed, {
				headers: { 'Content-Type': 'text/event-stream' }
			})
	);
	const last = (await collect(sse.streamTurn(request))).at(-1);
	assert.ok(last?.type === 'error');
	assert.equal(last.problem.code, 'protocol');
});

test('Runtime config preserves the same-origin root through HTTP client creation', async () => {
	const config = await resolveTutorApiConfig({
		fetcher: async () => Response.json({ mode: 'http', baseUrl: '/' })
	});
	assert.deepEqual(config, { mode: 'http', baseUrl: '/' });
	assert.ok(createTutorApiClient(config) instanceof HttpTutorClient);
});

test('A completed probe passes the HTTP guard locally without sharing its context', async () => {
	const task = { ...demoTask, taskId: 'a-gd-lernrate-auswahl' };
	const request = {
		...turn('completed', 0, { kind: 'message', text: 'Warum?' }),
		task,
		agentContext: {
			...attentionContext,
			visibleScreen: {
				...attentionContext.visibleScreen,
				taskRef: task,
				exerciseState: { revealed: true }
			}
		}
	};
	const bodies: TutorTurnRequest[] = [];
	const client = new HttpTutorClient('/', async (_url, init) => {
		bodies.push(JSON.parse(String(init?.body)));
		return new Response(null, { status: 503 });
	});
	await assert.rejects(client.turn(request));
	const [body] = bodies;
	assert.deepEqual(body.task, task);
	assert.equal(Object.hasOwn(body, 'agentContext'), false);
});

test('Mock recalls a saved note on Home and Activity', async () => {
	const api = new MockTutorClient(defaultFixtures, options);
	for (const route of ['/', '/aktivitaet']) {
		const result = await api.turn({
			...turn('note' + route, 0, { kind: 'message', text: 'Welche Notiz habe ich?' }),
			agentContext: {
				...attentionContext,
				visibleScreen: { route, updatedAt: 1, isIndependentProbe: false }
			}
		});
		assert.match(result.message?.text ?? '', /Was wird beim Skalieren kleiner/);
	}
});

test('Alle neun Übungen stellen eigene fachliche Rückfragen, die Probe erst nach Abschluss', async () => {
	const client = new MockTutorClient(buildEditorialMockFixtures(), options);
	const expectedTopics: Record<string, RegExp> = {
		'a-gd-schritte-vorhersagen': /Lernrate.*zurückpendelt/,
		'a-akkumulator-vorhersagen': /summe.*zweiten Durchlaufs/,
		'a-bp-addieren-erklaeren': /d · d.*beide Pfade.*\+=/,
		'a-bp-ki-backward-pruefen': /Produktregel.*a = b/,
		'a-ki-durchschnitt-pruefen': /Durchschnitt.*zufällig.*Zähler und Nenner/,
		'a-gd-kontrast-gradientenrichtung': /Schlucht.*negativen Gradienten/,
		'a-bp-preiskette-transfer': /Preiskette.*Kettenregel/,
		'a-bp-skizze-rechengraph': /verzweigt.*Rechengraph.*Pfeilen/,
		'a-gd-lernrate-auswahl': /Ableitung.*zwei Schritte/
	};
	const questions = new Set<string>();
	for (const exercise of exercises) {
		const revealed = exercise.format === 'independent-probe';
		const request = {
			...turn(exercise.task.taskId, 0, { kind: 'message', text: 'Erinnere mich an meine Notiz' }),
			task: exercise.task,
			agentContext: {
				...attentionContext,
				visibleScreen: {
					route: '/uebungen',
					taskRef: exercise.task,
					sectionTitle: 'Meine Vorhersage',
					updatedAt: 1,
					isIndependentProbe: false,
					exerciseState: { revealed }
				}
			}
		};
		if (revealed) {
			const active = await client.turn({
				...request,
				requestId: 'protected',
				sessionId: 'protected',
				agentContext: {
					...request.agentContext,
					visibleScreen: {
						...request.agentContext.visibleScreen,
						exerciseState: { revealed: false }
					}
				}
			});
			assert.match(active.message?.text ?? '', /eigenständig/);
			assert.doesNotMatch(active.message?.text ?? '', /Meine Vorhersage/);
		}
		const result = await client.turn(request);
		const answer = result.message?.text ?? '';
		assert.ok(answer.includes(exercise.title));
		assert.match(answer, /Meine Vorhersage/);
		assert.ok(answer.includes(attentionContext.savedNotesAndQuestions[0].text));
		// Compare the actual questions, without the exercise title or recalled context.
		const question = answer.split(/(?<=[.!?]) /).at(-1) ?? '';
		const topic = expectedTopics[exercise.task.taskId];
		assert.ok(topic, exercise.task.taskId);
		assert.match(question, topic);
		assert.match(question, /\?$/);
		questions.add(question);
		const boundary = await client.turn({
			...request,
			requestId: request.requestId + '-2',
			expectedRevision: 1,
			input: { kind: 'message', text: 'Sag mir die Lösung!' }
		});
		assert.match(boundary.message?.text ?? '', /Lösungsweg entwickelst du selbst/);
		assert.equal(boundary.artifact, undefined);
	}
	assert.equal(exercises.length, 9);
	assert.equal(questions.size, 9);
});

test('Mock: offene Abrufaufgabe unterscheidet Treffer, Alternativweg, Begründung und Fehler', async () => {
	const client = new MockTutorClient(buildEditorialMockFixtures(), options);
	const exercise = exercises.find(({ task }) => task.taskId === 'a-bp-addieren-erklaeren');
	assert.ok(exercise);
	const attempt = (requestId: string, text: string) =>
		client.evaluateExercise({
			kind: 'exercise',
			requestId,
			task: exercise.task,
			answer: { kind: 'text', text }
		});

	for (const text of ['08', '8,0', '8']) {
		const correct = await attempt('open-' + text, text);
		assert.equal(correct.result, 'korrekt', text);
		assert.ok(correct.evidence.length > 0);
	}

	for (const [id, text] of [
		['open-weg', '4 + 4 = 8'],
		['open-begruendung', 'Weil d zweimal vorkommt, addieren sich die Beiträge.']
	] as const) {
		const received = await attempt(id, text);
		assert.equal(received.result, 'nicht_pruefbar_oder_alternativweg', text);
		assert.equal(countsAsMastery(received.result), false);
		assert.deepEqual(received.evidence, []);
		assert.match(received.feedback, /\?$/);
		assert.doesNotMatch(received.feedback, /\b8\b/);
	}

	const wrong = await attempt('open-7', '7');
	assert.equal(wrong.result, 'falsch');
	assert.deepEqual(wrong.evidence, []);
	// A hint, never the full solution on the first wrong attempt.
	assert.doesNotMatch(wrong.feedback, /\b8\b|4 \+ 4/);
});

test('HTTP: agentContext nur mit shareWithApi: true, sonst nie im Body', async () => {
	const bodies: TutorTurnRequest[] = [];
	const api = new MockTutorClient(defaultFixtures, options);
	const fetcher: typeof fetch = async (_url, init) => {
		assert.ok(typeof init?.body === 'string');
		const body: TutorTurnRequest = JSON.parse(init.body);
		bodies.push(body);
		return Response.json(await api.turn(body));
	};
	const request = {
		...turn('share-off', 0, { kind: 'message', text: 'Formel bitte' }),
		agentContext: attentionContext
	};
	await new HttpTutorClient('/', fetcher, { shareWithApi: false }).turn(request);
	assert.equal(Object.hasOwn(bodies[0], 'agentContext'), false);
	await new HttpTutorClient('/', fetcher, { shareWithApi: true }).turn({
		...request,
		sessionId: 'share-on',
		requestId: 'share-on'
	});
	assert.deepEqual(bodies[1].agentContext, attentionContext);
});

test('HTTP: das 4-stufige evidenceLevel ist maßgeblich, ungeprüft bleibt neutral', async () => {
	const request: ExerciseAttemptRequest = {
		kind: 'exercise',
		requestId: 'level',
		task: demoTask,
		answer: { kind: 'text', text: 'Zeilen 5 · 6' }
	};
	const reply = (body: object) => async () =>
		Response.json({
			kind: 'exercise',
			requestId: 'level',
			attemptId: 'level:attempt',
			feedback: 'Eingereicht.',
			evidence: [],
			...body
		});
	const received = await new HttpTutorClient(
		'/',
		reply({ result: 'teilweise', evidenceLevel: 'nicht_pruefbar_oder_alternativweg' })
	).evaluateExercise(request);
	assert.equal(received.result, 'nicht_pruefbar_oder_alternativweg');
	assert.equal(countsAsMastery(received.result), false);

	const legacy = await new HttpTutorClient('/', reply({ result: 'teilweise' })).evaluateExercise(
		request
	);
	assert.equal(legacy.result, 'teilweise');

	await assert.rejects(
		new HttpTutorClient(
			'/',
			reply({ result: 'falsch', evidenceLevel: 'unbekannt' })
		).evaluateExercise(request),
		(error: unknown) => error instanceof ApiError && error.problem.code === 'protocol'
	);
});

test('HTTP mirror preserves goal-specific diagnostics and rejects contradictory mastery', async () => {
	const recordedAt = '2026-11-27T08:00:00Z';
	const recentPractice = [
		'korrekt',
		'teilweise',
		'falsch',
		'nicht_pruefbar_oder_alternativweg'
	].map((result, index) => ({
		id: 'attempt-' + index,
		itemId: demoTask.taskId,
		kind: 'exercise',
		recordedAt,
		result: index === 3 ? 'korrekt' : result,
		...(index === 3 && { evidenceLevel: result })
	}));
	const levels = ['geprueft_korrekt', 'teilwissen', 'nachgewiesener_fehler', 'geprueft_korrekt'];
	const evidence = recentPractice.map(({ id }, index) => ({
		evidenceLevel: levels[index],
		id: id + ':1',
		attemptId: id,
		taskId: demoTask.taskId,
		learningGoalId: 'goal',
		kind: 'anwendung',
		helpLevel: 0,
		recordedAt
	}));
	// Legacy rows can carry the attempt in the evidence ID or only in the timestamp.
	delete (evidence[1] as { attemptId?: string }).attemptId;
	delete (evidence[2] as { attemptId?: string }).attemptId;
	evidence[2].id = 'legacy';
	evidence[2].recordedAt = '2026-11-27T08:01:00+00:00';
	recentPractice[2].recordedAt = '2026-11-27T08:01:00Z';
	const client = new HttpTutorClient('/', async () =>
		Response.json({ course: demoCourse, recentPractice, evidence })
	);
	const mirror = await client.getActivityMirror(demoCourse);
	assert.equal(mirror.recentPractice[3].result, 'nicht_pruefbar_oder_alternativweg');
	assert.deepEqual(mirror.evidence, evidence.slice(0, 3));
});

test('Freie Kursfrage über HTTP behält Kurs und Sitzung über zwei Züge', async () => {
	const client = new HttpTutorClient(origin, async (url, init) => {
		const body = JSON.parse(String(init?.body));
		assert.deepEqual(body.course, demoCourse);
		assert.equal('task' in body, false);
		return fetch(url, init);
	});
	const first = await client.turn({
		course: demoCourse,
		sessionId: 'freie-kursfrage',
		expectedRevision: 0,
		requestId: 'frei-1',
		input: { kind: 'message', text: 'Wie lernt ein Netz?' }
	});
	assert.equal(first.session.task, null);
	assert.deepEqual(first.session.course, demoCourse);
	assert.equal(first.session.revision, 1);
	const second = await client.turn({
		task: null,
		course: demoCourse,
		sessionId: first.session.id,
		expectedRevision: first.session.revision,
		requestId: 'frei-2',
		input: { kind: 'message', text: 'Welche Rolle spielt der Gradient?' }
	});
	assert.equal(second.session.task, null);
	assert.equal(second.session.id, first.session.id);
	assert.equal(second.session.revision, 2);
});

test('HTTP prüft Aufgabe und Kurs der bestätigten Sitzung', async () => {
	const request = turn('sitzungsart', 0, { kind: 'message', text: 'Warum?' });
	const reply = await new MockTutorClient().turn(request);
	const withSession = (fields: object) =>
		new HttpTutorClient('/', async () =>
			Response.json({ ...reply, session: { ...reply.session, ...fields } })
		);
	const free = { ...request, task: null, course: demoCourse };
	for (const task of [{ courseId: 'kaputt' }, null, undefined])
		await assert.rejects(withSession({ task }).turn(request), (error) =>
			assertProblem(error, 'protocol')
		);
	for (const fields of [
		{ task: demoTask },
		{ task: null, course: { ...demoCourse, courseVersion: 'anders' } }
	])
		await assert.rejects(withSession(fields).turn(free), (error) =>
			assertProblem(error, 'protocol')
		);
	assert.equal(
		(await withSession({ task: undefined, course: demoCourse }).turn(free)).session.task,
		null
	);
});

test('HTTP contract for numeric substeps in both live exercises', async () => {
	const client = new HttpTutorClient(origin);
	for (const [taskId, text, level] of [
		['a-bp-addieren-erklaeren', '8', 'geprueft_korrekt'],
		['a-bp-addieren-erklaeren', '4', 'nachgewiesener_fehler'],
		['a-bp-preiskette-transfer', '0,476', 'geprueft_korrekt'],
		['a-bp-preiskette-transfer', '0.476', 'geprueft_korrekt'],
		['a-bp-preiskette-transfer', '0,48', 'teilwissen'],
		['a-bp-preiskette-transfer', '0,9', 'nachgewiesener_fehler']
	]) {
		const exercise = exercises.find((e) => e.task.taskId === taskId);
		assert.ok(exercise);
		assert.ok(visibleInMode(taskId, 'http'));
		const reply = await client.evaluateExercise({
			kind: 'exercise',
			requestId: 'numeric-' + text,
			task: exercise.task,
			answer: { kind: 'text', text }
		});
		assert.equal(reply.evidenceLevel, level, text);
		if (level === 'geprueft_korrekt') assert.equal(reply.evidence[0]?.evidenceScope, 'teilaspekt');
	}
});

test('HTTP exercise request includes only a defined sessionId', async () => {
	for (const sessionId of [undefined, 'sess-1']) {
		const client = new HttpTutorClient('/', async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			assert.equal(Object.hasOwn(body, 'sessionId'), sessionId !== undefined);
			assert.equal(body.sessionId, sessionId);
			return Response.json(await upstream.evaluateExercise(body));
		});
		await client.evaluateExercise({
			kind: 'exercise',
			requestId: 'bound-' + sessionId,
			sessionId,
			task: demoTask,
			answer: { kind: 'choice', optionIds: ['2x'] }
		});
	}
});

test('HTTP mirror preserves a multi-goal exercise diagnostic without linked evidence', async () => {
	const taskId = 'a-bp-addieren-erklaeren';
	for (const [result, helpLevel, expected] of [
		['falsch', 0, 'nicht_gekonnt'],
		['teilweise', 1, 'mit_hilfe_gelungen']
	] as const) {
		const practice = {
			id: 'new',
			kind: 'exercise',
			itemId: taskId,
			learningGoalId: 'lz-a',
			helpLevel,
			evidenceScope: 'teilaspekt',
			result,
			recordedAt: '2026-11-28T08:00:00Z'
		};
		const old = {
			id: 'old',
			taskId,
			learningGoalId: 'lz-a',
			kind: 'anwendung',
			helpLevel: 0,
			result: 'korrekt',
			recordedAt: '2026-11-26T08:00:00Z'
		};
		const client = new HttpTutorClient('/', async () =>
			Response.json({ course: demoCourse, recentPractice: [practice], evidence: [old] })
		);
		const mirror = await client.getActivityMirror(demoCourse);
		assert.deepEqual(mirror.recentPractice, [practice]);
		const observations = conceptEvidence([mirror]);
		const concept = { learningGoalId: 'lz-a', status: 'einmal_gelungen' } as const;
		assert.equal(resolveConceptStatus(concept, observations, 'http'), expected);
		assert.equal(
			resolveConceptStatus({ ...concept, learningGoalId: 'lz-b' }, observations, 'http'),
			'noch_zu_wenig_gesehen'
		);
	}
});
