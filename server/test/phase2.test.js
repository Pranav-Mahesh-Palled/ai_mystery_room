import test from 'node:test';
import assert from 'node:assert/strict';
import Case from '../models/Case.js';
import { allowedOrigins } from '../config/cors.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { z } from 'zod';

function validCase(overrides = {}) {
  return new Case({
    title: 'The Clockwork Gallery',
    premise: 'A rare painting disappears during a private exhibition.',
    story: 'A painting has vanished from a locked gallery.',
    difficulty: 'Easy',
    suspects: [{
      suspectId: 'S1', name: 'Mara Vale', role: 'Curator',
      personality: 'Careful', motive: 'Debt', alibi: 'She was in the archive.',
    }],
    clues: [
      { clueId: 'C1', title: 'A fiber', location: 'Gallery', description: 'Blue wool', discovered: true },
      { clueId: 'C2', title: 'A ledger', location: 'Office', description: 'An altered entry', discovered: true },
    ],
    hints: [{ hintId: 'H1', text: 'Check the timeline.', unlocked: true }],
    solution: { culpritId: 'S1', supportingClueIds: ['C1', 'C2'], explanation: 'The evidence conflicts with the alibi.' },
    status: 'completed',
    accusation: { suspectId: 'S1', isCorrect: true, submittedAt: new Date() },
    scoreBreakdown: { basePoints: 100, clueBonus: 0, hintPenalty: 0, total: 100 },
    ...overrides,
  });
}

test('new cases initialize active with undiscovered clues and locked hints', async () => {
  const mystery = validCase();
  await mystery.validate();

  assert.equal(mystery.status, 'active');
  assert.equal(mystery.accusation, null);
  assert.equal(mystery.scoreBreakdown, null);
  assert.deepEqual(mystery.clues.map(({ discovered }) => discovered), [false, false]);
  assert.deepEqual(mystery.hints.map(({ unlocked }) => unlocked), [false]);
  assert.equal(mystery.schema.options.timestamps, true);
  assert.equal(mystery.clues[0]._id, undefined);
});

test('case validation rejects bad enums and references to missing evidence', async () => {
  const badDifficulty = validCase({ difficulty: 'Impossible' });
  await assert.rejects(badDifficulty.validate(), { name: 'ValidationError' });

  const badReferences = validCase({
    solution: { culpritId: 'S9', supportingClueIds: ['C1', 'C9'], explanation: 'Invalid references.' },
  });
  await assert.rejects(badReferences.validate(), { name: 'ValidationError' });
});

test('CORS permits local development and configured production origins only', () => {
  process.env.NODE_ENV = 'development';
  process.env.CLIENT_URL = 'https://mystery.example';
  assert.deepEqual([...allowedOrigins()].sort(), ['http://localhost:5173', 'https://mystery.example']);

  process.env.NODE_ENV = 'production';
  assert.deepEqual([...allowedOrigins()], ['https://mystery.example']);
  delete process.env.CLIENT_URL;
  delete process.env.NODE_ENV;
});

test('request validator returns a consistent invalid input error', async () => {
  const middleware = validateRequest({ body: z.object({ name: z.string().min(1) }) });
  const request = { body: { name: '' } };
  let actualError;

  middleware(request, {}, (error) => { actualError = error; });

  assert.equal(actualError.status, 400);
  assert.equal(actualError.code, 'INVALID_INPUT');
  assert.ok(Array.isArray(actualError.details));
});

test('unexpected errors return a generic response without internal details', () => {
  process.env.NODE_ENV = 'production';
  let responseStatus;
  let responseBody;
  const response = {
    headersSent: false,
    status(status) { responseStatus = status; return this; },
    json(body) { responseBody = body; return this; },
  };

  errorHandler(new Error('mongodb://user:secret@internal-host/db'), {}, response, () => {});

  assert.equal(responseStatus, 500);
  assert.deepEqual(responseBody, {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
  assert.equal(JSON.stringify(responseBody).includes('secret'), false);
  delete process.env.NODE_ENV;
});
