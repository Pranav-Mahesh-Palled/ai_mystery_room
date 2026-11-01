import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createCaseController } from '../controllers/caseController.js';
import { createCaseRouter } from '../routes/caseRoutes.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createGenerationRateLimiter } from '../middleware/rateLimiter.js';
import { DIFFICULTY_CONFIG } from '../utils/gameConfig.js';
import { MysteryGenerationError } from '../services/geminiService.js';
import Case from '../models/Case.js';
import { requestDiagnostics } from '../middleware/requestDiagnostics.js';
import { createAIService } from '../services/aiService.js';
import { generateMystery as generateOpenAI } from '../services/openaiService.js';

function makeMystery(difficulty = 'Easy') {
  const counts = DIFFICULTY_CONFIG[difficulty];
  return {
    title: 'The Clockwork Gallery',
    story: 'A painting disappears during a private exhibition.\n\nA careful timeline reveals who could reach the locked room.',
    suspects: Array.from({ length: counts.suspects }, (_, index) => ({
      suspectId: `S${index + 1}`,
      name: `Suspect ${index + 1}`,
      role: 'Gallery employee',
      personality: 'Observant and careful',
      motive: 'The painting would settle a serious debt.',
      alibi: `They claim to have been in room ${index + 1}.`,
    })),
    clues: Array.from({ length: counts.clues }, (_, index) => ({
      clueId: `C${index + 1}`,
      title: `Clue ${index + 1}`,
      location: `Room ${index + 1}`,
      description: `Clue ${index + 1} provides a detail about the timeline.`,
    })),
    hints: Array.from({ length: counts.hints }, (_, index) => ({
      hintId: `H${index + 1}`,
      text: `Hint ${index + 1} helps compare the timeline.`,
    })),
    solution: {
      culpritId: 'S1',
      supportingClueIds: ['C1', 'C2'],
      explanation: 'The first two clues contradict the culprit’s alibi and establish access to the gallery.',
    },
  };
}

function makeMemoryDatabase({ saveDelayMs = 5, failSave = false } = {}) {
  const records = new Map();
  let nextId = 1;

  class MemoryCase {
    constructor(data) {
      Object.assign(this, structuredClone(data));
      this._id ??= nextId.toString(16).padStart(24, '0');
      nextId += 1;
      this.__v ??= 0;
      this.isNew = true;
    }

    static async findById(id) {
      const stored = records.get(String(id));
      if (!stored) return null;
      const document = new MemoryCase(structuredClone(stored));
      document._id = stored._id;
      document.__v = stored.__v;
      document.isNew = false;
      return document;
    }

    get id() {
      return String(this._id);
    }

    async save() {
      await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      if (failSave) throw new Error('private database failure detail');

      const current = records.get(String(this._id));
      if (current && current.__v !== this.__v) {
        const conflict = new Error('optimistic concurrency conflict');
        conflict.name = 'VersionError';
        throw conflict;
      }
      if (current) this.__v += 1;
      this.isNew = false;
      records.set(String(this._id), this.toObject());
      return this;
    }

    toObject() {
      const { isNew: _isNew, ...data } = this;
      return structuredClone(data);
    }
  }

  return {
    CaseModel: MemoryCase,
    records,
    seed(caseData, id = 'aaaaaaaaaaaaaaaaaaaaaaaa') {
      records.set(id, { _id: id, __v: 0, ...structuredClone(caseData) });
      return id;
    },
  };
}

async function startApi({
  dbReady = true,
  generateContent = async ({ difficulty }) => makeMystery(difficulty),
  limiter = createGenerationRateLimiter({ windowMs: 60_000, limit: 20 }),
  databaseOptions,
} = {}) {
  const database = makeMemoryDatabase(databaseOptions);
  const controller = createCaseController({
    CaseModel: database.CaseModel,
    generateContent,
    dbIsReady: () => dbReady,
  });
  const app = express();
  app.use(requestDiagnostics);
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use('/api/cases', createCaseRouter({ controller, generationLimiter: limiter }));
  app.use(errorHandler);

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    ...database,
    baseUrl: `http://127.0.0.1:${port}/api/cases`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('POST /api/cases uses the OpenAI dispatcher and completes validated persistence without revealing the solution', async () => {
  const previousProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'openai';
  const providerRequests = [];
  const fakeOpenAIClient = {
    responses: {
      async parse(request) {
        providerRequests.push(request);
        return { output_parsed: makeMystery('Medium') };
      },
    },
  };
  const dispatcher = createAIService({
    openai: (input) => generateOpenAI(input, { client: fakeOpenAIClient }),
    gemini: async () => { throw new Error('Gemini must not be selected'); },
  });

  try {
    await withApi({ generateContent: dispatcher.generateMystery }, async (api) => {
      const { response, body } = await jsonRequest(api.baseUrl, {
        method: 'POST',
        body: JSON.stringify({ premise: 'A painting disappears during a private exhibition.', difficulty: 'Medium' }),
      });

      assert.equal(response.status, 201);
      assert.match(response.headers.get('x-request-id'), /^[\da-f-]{36}$/i);
      assert.deepEqual(Object.keys(body).sort(), ['caseId', 'difficulty', 'title']);
      assert.equal(providerRequests.length, 1);
      assert.equal(providerRequests[0].model, process.env.OPENAI_MODEL || 'gpt-6-luna');
      const persisted = api.records.get(body.caseId);
      assert.ok(persisted);
      assert.equal(persisted.difficulty, 'Medium');
      assert.equal(persisted.status, 'active');
      assert.ok(persisted.clues.every((clue) => clue.discovered === false));
      assert.ok(persisted.hints.every((hint) => hint.unlocked === false));
      assert.deepEqual(persisted.solution.supportingClueIds, ['C1', 'C2']);
      assert.equal(JSON.stringify(body).includes('culpritId'), false);
      assert.equal(JSON.stringify(body).includes('explanation'), false);
    });
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
  }
});

async function withApi(options, callback) {
  const api = await startApi(options);
  try {
    await callback(api);
  } finally {
    await api.close();
  }
}

function activeCase(difficulty = 'Easy') {
  const mystery = makeMystery(difficulty);
  return {
    ...mystery,
    premise: 'A painting disappears during a private exhibition.',
    difficulty,
    status: 'active',
    clues: mystery.clues.map((clue, index) => ({ ...clue, discovered: index === 1 })),
    hints: mystery.hints.map((hint, index) => ({ ...hint, unlocked: index === 0 })),
    accusation: null,
    scoreBreakdown: null,
  };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json();
  return { response, body };
}

test('the Mongoose model enables optimistic concurrency for gameplay saves', () => {
  assert.equal(Case.schema.options.optimisticConcurrency, true);
});

test('generation validates input, initializes server-owned state, and returns only a safe summary', async () => {
  let generationCalls = 0;
  await withApi({ generateContent: async (input) => { generationCalls += 1; return makeMystery(input.difficulty); } }, async (api) => {
    const { response, body } = await jsonRequest(api.baseUrl, {
      method: 'POST', body: JSON.stringify({ premise: '  A painting disappears during a private exhibition.  ', difficulty: 'Medium' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(body).sort(), ['caseId', 'difficulty', 'title']);
    assert.equal(body.difficulty, 'Medium');
    assert.equal(generationCalls, 1);

    const saved = api.records.get(body.caseId);
    assert.equal(saved.status, 'active');
    assert.ok(saved.clues.every(({ discovered }) => discovered === false));
    assert.ok(saved.hints.every(({ unlocked }) => unlocked === false));
    assert.equal(saved.accusation, null);
    assert.equal(saved.scoreBreakdown, null);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('solution'), false);
    assert.equal(serialized.includes('culpritId'), false);
  });
});

test('complete generated-case API workflow honors every difficulty count and reveals results only after accusation', async () => {
  await withApi({}, async (api) => {
    for (const [difficulty, expected] of Object.entries(DIFFICULTY_CONFIG)) {
      const created = await jsonRequest(api.baseUrl, {
        method: 'POST',
        body: JSON.stringify({ premise: `A ${difficulty.toLowerCase()} case begins at a quiet gallery.`, difficulty }),
      });
      assert.equal(created.response.status, 201);
      assert.equal(created.body.difficulty, difficulty);

      const activePath = `${api.baseUrl}/${created.body.caseId}`;
      const active = await jsonRequest(activePath);
      assert.equal(active.response.status, 200);
      assert.equal(active.body.suspects.length, expected.suspects);
      assert.equal(active.body.clues.length, expected.clues);
      assert.equal(active.body.hints.length, expected.hints);
      assert.equal(JSON.stringify(active.body).includes('culpritId'), false);
      assert.equal(JSON.stringify(active.body).includes('Clue 1 provides a detail'), false);
      assert.equal(JSON.stringify(active.body).includes('Hint 1 helps'), false);
      assert.equal(JSON.stringify(active.body).includes('requestKey'), false);

      const earlyResult = await jsonRequest(`${activePath}/result`);
      assert.equal(earlyResult.response.status, 403);
      assert.equal(earlyResult.body.error.code, 'CASE_NOT_COMPLETED');

      const discovered = await jsonRequest(`${activePath}/clues/C1/discover`, { method: 'POST' });
      assert.equal(discovered.response.status, 200);
      assert.equal(discovered.body.clue.description, 'Clue 1 provides a detail about the timeline.');
      const hint = await jsonRequest(`${activePath}/hints`, {
        method: 'POST', headers: { 'Idempotency-Key': `workflow-${difficulty.toLowerCase()}-00001` },
      });
      assert.equal(hint.response.status, 200);
      assert.equal(hint.body.hint.hintId, 'H1');

      const accused = await jsonRequest(`${activePath}/accuse`, {
        method: 'POST', body: JSON.stringify({ suspectId: 'S1' }),
      });
      assert.equal(accused.response.status, 200);
      assert.equal(accused.body.isCorrect, true);
      assert.equal(accused.body.scoreBreakdown.total, expected.basePoints - 5);

      const result = await jsonRequest(`${activePath}/result`);
      assert.equal(result.response.status, 200);
      assert.equal(result.body.trueCulprit.suspectId, 'S1');
      assert.equal(result.body.scoreBreakdown.basePoints, expected.basePoints);
      assert.equal(result.body.scoreBreakdown.clueBonus, 5);
      assert.equal(result.body.scoreBreakdown.hintPenalty, 10);
      assert.equal(result.body.finalScore, expected.basePoints - 5);
    }
  });
});

test('generation rejects short/long premises, invalid difficulty, and browser-supplied game state', async () => {
  let calls = 0;
  await withApi({ generateContent: async () => { calls += 1; return makeMystery(); } }, async (api) => {
    const invalidRequests = [
      { premise: 'short', difficulty: 'Easy' },
      { premise: 'x'.repeat(301), difficulty: 'Easy' },
      { premise: 'A painting disappears from a gallery.', difficulty: 'impossible' },
      { premise: 'A painting disappears from a gallery.', difficulty: 'Easy', solution: { culpritId: 'S1' } },
    ];
    for (const request of invalidRequests) {
      const { response, body } = await jsonRequest(api.baseUrl, { method: 'POST', body: JSON.stringify(request) });
      assert.equal(response.status, 400);
      assert.equal(body.error.code, 'INVALID_INPUT');
    }
    assert.equal(calls, 0);
  });
});

test('generation does not call Gemini when the database is unavailable and never saves invalid output', async () => {
  let calls = 0;
  await withApi({ dbReady: false, generateContent: async () => { calls += 1; return makeMystery(); } }, async (api) => {
    const { response, body } = await jsonRequest(api.baseUrl, {
      method: 'POST', body: JSON.stringify({ premise: 'A painting disappears from a gallery.', difficulty: 'Easy' }),
    });
    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'DATABASE_UNAVAILABLE');
    assert.equal(calls, 0);
    assert.equal(api.records.size, 0);
  });

  await withApi({ generateContent: async () => ({ ...makeMystery(), clues: [] }) }, async (api) => {
    const { response, body } = await jsonRequest(api.baseUrl, {
      method: 'POST', body: JSON.stringify({ premise: 'A painting disappears from a gallery.', difficulty: 'Easy' }),
    });
    assert.equal(response.status, 502);
    assert.equal(body.error.code, 'MYSTERY_GENERATION_FAILED');
    assert.equal(api.records.size, 0);
  });
});

test('generation returns safe Gemini and database failures', async () => {
  await withApi({ generateContent: async () => { throw new MysteryGenerationError('GEMINI_UNAVAILABLE', 'The mystery service is temporarily unavailable.', 503); } }, async (api) => {
    const { response, body } = await jsonRequest(api.baseUrl, {
      method: 'POST', body: JSON.stringify({ premise: 'A painting disappears from a gallery.', difficulty: 'Easy' }),
    });
    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'GEMINI_UNAVAILABLE');
    assert.equal(JSON.stringify(body).includes('private provider payload'), false);
    assert.equal(api.records.size, 0);
  });

  await withApi({ databaseOptions: { failSave: true } }, async (api) => {
    const { response, body } = await jsonRequest(api.baseUrl, {
      method: 'POST', body: JSON.stringify({ premise: 'A painting disappears from a gallery.', difficulty: 'Easy' }),
    });
    assert.equal(response.status, 500);
    assert.equal(body.error.code, 'DATABASE_ERROR');
    assert.equal(JSON.stringify(body).includes('private database failure detail'), false);
  });
});

test('generation route rate limit is scoped to generation and returns the standard error shape', async () => {
  const limiter = createGenerationRateLimiter({ windowMs: 60_000, limit: 1 });
  await withApi({ limiter }, async (api) => {
    const payload = JSON.stringify({ premise: 'A painting disappears from a gallery.', difficulty: 'Easy' });
    const first = await jsonRequest(api.baseUrl, { method: 'POST', body: payload });
    const second = await jsonRequest(api.baseUrl, { method: 'POST', body: payload });
    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 429);
    assert.deepEqual(Object.keys(second.body.error).sort(), ['code', 'message', 'requestId']);
    assert.equal(second.body.error.requestId, second.response.headers.get('x-request-id'));
    assert.equal(second.body.error.code, 'RATE_LIMITED');
  });
});

test('case retrieval validates IDs and omits all protected data in active and completed states', async () => {
  await withApi({}, async (api) => {
    const id = api.seed(activeCase());
    const malformed = await jsonRequest(`${api.baseUrl}/not-an-object-id`);
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_INPUT');

    const missing = await jsonRequest(`${api.baseUrl}/bbbbbbbbbbbbbbbbbbbbbbbb`);
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error.code, 'CASE_NOT_FOUND');

    const active = await jsonRequest(`${api.baseUrl}/${id}`);
    const activeJson = JSON.stringify(active.body);
    assert.equal(active.response.status, 200);
    assert.equal(active.body.caseId, id);
    assert.equal(active.body.status, 'active');
    assert.equal(activeJson.includes('solution'), false);
    assert.equal(activeJson.includes('culpritId'), false);
    assert.equal(activeJson.includes('Clue 1 provides a detail'), false);
    assert.equal(activeJson.includes('Hint 2 helps'), false);
    assert.equal(activeJson.includes('Clue 2 provides a detail'), true);

    const saved = api.records.get(id);
    saved.status = 'completed';
    saved.accusation = { suspectId: 'S2', isCorrect: false, submittedAt: new Date() };
    saved.scoreBreakdown = { basePoints: 0, clueBonus: 5, hintPenalty: 10, total: 0 };
    api.records.set(id, saved);
    const completed = await jsonRequest(`${api.baseUrl}/${id}`);
    const completedJson = JSON.stringify(completed.body);
    assert.equal(completed.body.status, 'completed');
    assert.equal(completedJson.includes('solution'), false);
    assert.equal(completedJson.includes('accusation'), false);
    assert.equal(completedJson.includes('scoreBreakdown'), false);
  });
});

test('clue discovery persists once, returns the description, and is safe under duplicate requests', async () => {
  await withApi({}, async (api) => {
    const id = api.seed(activeCase());
    const path = `${api.baseUrl}/${id}/clues/C1/discover`;
    const [first, simultaneous] = await Promise.all([
      jsonRequest(path, { method: 'POST' }),
      jsonRequest(path, { method: 'POST' }),
    ]);
    assert.equal(first.response.status, 200);
    assert.equal(simultaneous.response.status, 200);
    assert.equal(first.body.discoveredCluesCount, 2); // C2 was already discovered.
    assert.equal(simultaneous.body.discoveredCluesCount, 2);
    assert.equal(first.body.clue.discovered, true);
    assert.equal(first.body.clue.description, 'Clue 1 provides a detail about the timeline.');
    assert.equal(api.records.get(id).clues.filter(({ discovered }) => discovered).length, 2);

    const missingClue = await jsonRequest(`${api.baseUrl}/${id}/clues/C99/discover`, { method: 'POST' });
    assert.equal(missingClue.response.status, 404);
    const missingCase = await jsonRequest(`${api.baseUrl}/cccccccccccccccccccccccc/clues/C1/discover`, { method: 'POST' });
    assert.equal(missingCase.response.status, 404);

    const completed = api.records.get(id);
    completed.status = 'completed';
    api.records.set(id, completed);
    const rejected = await jsonRequest(path, { method: 'POST' });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.body.error.code, 'CASE_COMPLETED');
  });
});

test('hint requests unlock in order, coalesce simultaneous clicks, and stop at the limit', async () => {
  await withApi({ databaseOptions: { saveDelayMs: 100 } }, async (api) => {
    const caseData = activeCase();
    caseData.hints.forEach((hint) => { hint.unlocked = false; });
    const id = api.seed(caseData);
    const path = `${api.baseUrl}/${id}/hints`;
    const [first, duplicate] = await Promise.all([
      jsonRequest(path, { method: 'POST' }),
      jsonRequest(path, { method: 'POST' }),
    ]);
    assert.equal(first.response.status, 200);
    assert.equal(duplicate.response.status, 200);
    assert.equal(first.body.hint.hintId, 'H1');
    assert.equal(duplicate.body.hint.hintId, 'H1');
    assert.equal(first.body.unlockedHintsCount, 1);
    assert.equal(first.body.remainingHints, 1);
    assert.deepEqual(api.records.get(id).hints.map(({ unlocked }) => unlocked), [true, false]);

    const second = await jsonRequest(path, { method: 'POST' });
    assert.equal(second.response.status, 200);
    assert.equal(second.body.hint.hintId, 'H2');
    assert.equal(second.body.remainingHints, 0);
    const exhausted = await jsonRequest(path, { method: 'POST' });
    assert.equal(exhausted.response.status, 400);
    assert.equal(exhausted.body.error.code, 'NO_HINTS_REMAINING');

    const completed = api.records.get(id);
    completed.status = 'completed';
    api.records.set(id, completed);
    const rejected = await jsonRequest(path, { method: 'POST' });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.body.error.code, 'CASE_COMPLETED');
  });
});

test('a retried hint request with the same idempotency key returns its original hint', async () => {
  await withApi({}, async (api) => {
    const caseData = activeCase();
    caseData.hints.forEach((hint) => { hint.unlocked = false; });
    const id = api.seed(caseData);
    const path = `${api.baseUrl}/${id}/hints`;
    const options = { method: 'POST', headers: { 'Idempotency-Key': 'request-key-00000001' } };

    const first = await jsonRequest(path, options);
    const retried = await jsonRequest(path, options);
    assert.equal(first.response.status, 200);
    assert.equal(retried.response.status, 200);
    assert.equal(first.body.hint.hintId, 'H1');
    assert.equal(retried.body.hint.hintId, 'H1');
    assert.equal(api.records.get(id).hints.filter(({ unlocked }) => unlocked).length, 1);

    const newAction = await jsonRequest(path, {
      method: 'POST', headers: { 'Idempotency-Key': 'request-key-00000002' },
    });
    assert.equal(newAction.body.hint.hintId, 'H2');
    assert.equal(api.records.get(id).hints.filter(({ unlocked }) => unlocked).length, 2);
  });
});

test('accusation validates suspects, persists an authoritative score, and blocks a second submission', async () => {
  await withApi({}, async (api) => {
    const id = api.seed(activeCase());
    const path = `${api.baseUrl}/${id}/accuse`;
    const malformed = await jsonRequest(path, { method: 'POST', body: JSON.stringify({ suspectId: 'S9' }) });
    assert.equal(malformed.response.status, 400);

    const invalidSuspect = await jsonRequest(path, { method: 'POST', body: JSON.stringify({ suspectId: 'S5' }) });
    assert.equal(invalidSuspect.response.status, 400);
    assert.equal(invalidSuspect.body.error.code, 'INVALID_SUSPECT');

    const result = await jsonRequest(path, { method: 'POST', body: JSON.stringify({ suspectId: 'S1' }) });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.body.scoreBreakdown, { basePoints: 100, clueBonus: 5, hintPenalty: 10, total: 95 });
    const saved = api.records.get(id);
    assert.equal(saved.status, 'completed');
    assert.equal(saved.accusation.suspectId, 'S1');
    assert.equal(saved.accusation.isCorrect, true);
    assert.ok(saved.accusation.submittedAt instanceof Date);
    assert.deepEqual(saved.scoreBreakdown, result.body.scoreBreakdown);
    assert.equal(JSON.stringify(result.body).includes('culpritId'), false);

    const repeated = await jsonRequest(path, { method: 'POST', body: JSON.stringify({ suspectId: 'S2' }) });
    assert.equal(repeated.response.status, 400);
    assert.equal(repeated.body.error.code, 'CASE_COMPLETED');
  });
});

test('concurrent accusations have exactly one winner and the result endpoint reveals only after completion', async () => {
  await withApi({}, async (api) => {
    const id = api.seed(activeCase('Medium'));
    const resultPath = `${api.baseUrl}/${id}/result`;
    const activeResult = await jsonRequest(resultPath);
    assert.equal(activeResult.response.status, 403);
    assert.equal(activeResult.body.error.code, 'CASE_NOT_COMPLETED');

    const accusationPath = `${api.baseUrl}/${id}/accuse`;
    const requests = await Promise.all([
      jsonRequest(accusationPath, { method: 'POST', body: JSON.stringify({ suspectId: 'S1' }) }),
      jsonRequest(accusationPath, { method: 'POST', body: JSON.stringify({ suspectId: 'S2' }) }),
    ]);
    assert.equal(requests.filter(({ response }) => response.status === 200).length, 1);
    assert.equal(requests.filter(({ response }) => response.status === 400).length, 1);
    assert.equal(api.records.get(id).status, 'completed');

    const final = await jsonRequest(resultPath);
    assert.equal(final.response.status, 200);
    assert.equal(final.body.caseId, id);
    assert.equal(final.body.trueCulprit.suspectId, 'S1');
    assert.ok(final.body.solution.explanation);
    assert.deepEqual(final.body.solution.supportingClues.map(({ clueId }) => clueId), ['C1', 'C2']);
    assert.equal(final.body.finalScore, final.body.scoreBreakdown.total);
    assert.deepEqual(Object.keys(final.body).sort(), [
      'accusation', 'caseId', 'difficulty', 'finalScore', 'isCorrect', 'scoreBreakdown', 'solution', 'title', 'trueCulprit',
    ]);

    const missing = await jsonRequest(`${api.baseUrl}/dddddddddddddddddddddddd/result`);
    assert.equal(missing.response.status, 404);
  });
});

test('wrong accusation keeps discovered-clue bonuses and subtracts hint penalties', async () => {
  await withApi({}, async (api) => {
    const caseData = activeCase('Hard');
    caseData.clues.forEach((clue, index) => { clue.discovered = index < 3; });
    caseData.hints.forEach((hint, index) => { hint.unlocked = index === 0; });
    const id = api.seed(caseData);

    const accusation = await jsonRequest(`${api.baseUrl}/${id}/accuse`, {
      method: 'POST', body: JSON.stringify({ suspectId: 'S2' }),
    });
    assert.equal(accusation.response.status, 200);
    assert.equal(accusation.body.isCorrect, false);
    assert.deepEqual(accusation.body.scoreBreakdown, { basePoints: 0, clueBonus: 15, hintPenalty: 10, total: 5 });

    const result = await jsonRequest(`${api.baseUrl}/${id}/result`);
    assert.equal(result.body.isCorrect, false);
    assert.equal(result.body.accusation.suspectId, 'S2');
    assert.equal(result.body.trueCulprit.suspectId, 'S1');
    assert.equal(result.body.finalScore, 5);
  });
});
