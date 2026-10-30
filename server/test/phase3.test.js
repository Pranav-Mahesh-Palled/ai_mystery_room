import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Case from '../models/Case.js';
import {
  DIFFICULTY_CONFIG,
  createMysteryContentSchema,
  validateMysteryOutput,
} from '../utils/validators.js';
import { sanitizeActiveCase } from '../utils/sanitizer.js';
import { calculateScore } from '../utils/scoring.js';
import { createGeminiJsonSchema, generateMystery, MysteryGenerationError } from '../services/geminiService.js';

const originalModel = process.env.GEMINI_MODEL;
if (!process.env.GEMINI_MODEL) process.env.GEMINI_MODEL = 'test-mystery-model';
after(() => {
  if (originalModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalModel;
});

function makeMystery(difficulty = 'Easy') {
  const counts = DIFFICULTY_CONFIG[difficulty];
  return {
    title: 'The Clockwork Gallery',
    story: 'A painting disappears during a private exhibition.\n\nThe gallery was locked from the inside.',
    suspects: Array.from({ length: counts.suspects }, (_, index) => ({
      suspectId: `S${index + 1}`,
      name: `Suspect ${index + 1}`,
      role: 'Gallery employee',
      personality: 'Careful and observant',
      motive: 'A debt makes the painting valuable to them.',
      alibi: 'They say they were in the archive during the theft.',
    })),
    clues: Array.from({ length: counts.clues }, (_, index) => ({
      clueId: `C${index + 1}`,
      title: `Clue ${index + 1}`,
      location: 'The gallery',
      description: `Clue ${index + 1} contains a detail that can be compared with the timeline.`,
    })),
    hints: Array.from({ length: counts.hints }, (_, index) => ({
      hintId: `H${index + 1}`,
      text: `Hint ${index + 1}: compare the evidence with the timeline.`,
    })),
    solution: {
      culpritId: 'S1',
      supportingClueIds: ['C1', 'C2'],
      explanation: 'The first two clues contradict the culprit’s alibi and establish how they entered the gallery.',
    },
  };
}

function fakeClient(responses, seenRequests = []) {
  let index = 0;
  return {
    models: {
      async generateContent(request) {
        seenRequests.push(request);
        const next = responses[index++];
        if (next instanceof Error) throw next;
        return typeof next === 'string' ? { text: next } : next;
      },
    },
  };
}

test('difficulty configuration and schemas enforce the exact counts', () => {
  assert.deepEqual(DIFFICULTY_CONFIG, {
    Easy: { suspects: 3, clues: 5, hints: 2, basePoints: 100 },
    Medium: { suspects: 4, clues: 7, hints: 3, basePoints: 150 },
    Hard: { suspects: 5, clues: 9, hints: 3, basePoints: 200 },
  });

  for (const difficulty of Object.keys(DIFFICULTY_CONFIG)) {
    const parsed = validateMysteryOutput(makeMystery(difficulty), difficulty);
    const providerSchema = createGeminiJsonSchema(difficulty);
    assert.equal(parsed.suspects.length, DIFFICULTY_CONFIG[difficulty].suspects);
    assert.equal(parsed.clues.length, DIFFICULTY_CONFIG[difficulty].clues);
    assert.equal(parsed.hints.length, DIFFICULTY_CONFIG[difficulty].hints);
    assert.equal(providerSchema.properties.suspects.minItems, String(DIFFICULTY_CONFIG[difficulty].suspects));
    assert.equal(providerSchema.properties.clues.maxItems, String(DIFFICULTY_CONFIG[difficulty].clues));
    assert.equal(providerSchema.properties.hints.minItems, String(DIFFICULTY_CONFIG[difficulty].hints));
  }
});

test('generated mystery schema rejects wrong counts, missing text, and duplicate IDs', () => {
  const badSuspects = makeMystery();
  badSuspects.suspects.pop();
  assert.throws(() => validateMysteryOutput(badSuspects, 'Easy'));

  const badClues = makeMystery();
  badClues.clues.pop();
  assert.throws(() => validateMysteryOutput(badClues, 'Easy'));

  const badHints = makeMystery();
  badHints.hints.pop();
  assert.throws(() => validateMysteryOutput(badHints, 'Easy'));

  const missingText = makeMystery();
  missingText.suspects[0].name = '  ';
  assert.throws(() => validateMysteryOutput(missingText, 'Easy'));

  for (const collection of ['suspects', 'clues', 'hints']) {
    const duplicate = makeMystery();
    const idField = { suspects: 'suspectId', clues: 'clueId', hints: 'hintId' }[collection];
    duplicate[collection][1][idField] = duplicate[collection][0][idField];
    assert.throws(() => validateMysteryOutput(duplicate, 'Easy'));
  }
});

test('generated mystery schema checks culprit and supporting clue references', () => {
  const invalidCulprit = makeMystery();
  invalidCulprit.solution.culpritId = 'S4';
  assert.throws(() => validateMysteryOutput(invalidCulprit, 'Easy'));

  const missingSupport = makeMystery();
  missingSupport.solution.supportingClueIds = ['C1'];
  assert.throws(() => validateMysteryOutput(missingSupport, 'Easy'));

  const duplicateSupport = makeMystery();
  duplicateSupport.solution.supportingClueIds = ['C1', 'C1'];
  assert.throws(() => validateMysteryOutput(duplicateSupport, 'Easy'));

  const nonexistentSupport = makeMystery();
  nonexistentSupport.solution.supportingClueIds = ['C1', 'C9'];
  assert.throws(() => validateMysteryOutput(nonexistentSupport, 'Easy'));
});

test('generated mystery schema rejects excessive lengths and unknown state fields', () => {
  const fieldLimits = [
    ['title', 121],
    ['story', 5001],
    ['suspects.0.name', 81],
    ['suspects.0.alibi', 501],
    ['clues.0.location', 121],
    ['clues.0.description', 1001],
    ['hints.0.text', 501],
    ['solution.explanation', 2001],
  ];
  for (const [path, length] of fieldLimits) {
    const mystery = makeMystery();
    const parts = path.split('.');
    const field = parts.pop();
    const target = parts.reduce((value, part) => value[Number.isInteger(Number(part)) ? Number(part) : part], mystery);
    target[field] = 'x'.repeat(length);
    assert.throws(() => validateMysteryOutput(mystery, 'Easy'), path);
  }

  const withClientState = makeMystery();
  withClientState.clues[0].discovered = true;
  assert.throws(() => validateMysteryOutput(withClientState, 'Easy'));
  assert.throws(() => createMysteryContentSchema('Impossible'));
});

test('active-case sanitizer serializes only safe case fields for plain objects and documents', () => {
  const sample = {
    _id: new mongoose.Types.ObjectId(),
    title: 'The Clockwork Gallery',
    premise: 'A painting disappears during a private exhibition.',
    story: 'The gallery was locked.',
    difficulty: 'Easy',
    status: 'active',
    suspects: [{ suspectId: 'S1', name: 'Mara', role: 'Curator', personality: 'Careful', motive: 'Debt', alibi: 'Archive', privateNote: 'safe?' }],
    clues: [
      { clueId: 'C1', title: 'Dust', location: 'Gallery', description: 'Hidden dust trace', discovered: false },
      { clueId: 'C2', title: 'Ledger', location: 'Office', description: 'Altered at 8 pm', discovered: true },
    ],
    hints: [
      { hintId: 'H1', text: 'Locked text', unlocked: false },
      { hintId: 'H2', text: 'Compare the ledger with the alibi.', unlocked: true },
    ],
    solution: { culpritId: 'S1', explanation: 'Confidential solution text', supportingClueIds: ['C1', 'C2'] },
    accusation: { suspectId: 'S1', isCorrect: true },
    scoreBreakdown: { basePoints: 100, clueBonus: 5, hintPenalty: 0, total: 105 },
  };

  const serialized = JSON.stringify(sanitizeActiveCase(sample));
  assert.equal(serialized.includes('solution'), false);
  assert.equal(serialized.includes('accusation'), false);
  assert.equal(serialized.includes('scoreBreakdown'), false);
  assert.equal(serialized.includes('Hidden dust trace'), false);
  assert.equal(serialized.includes('Locked text'), false);
  assert.equal(serialized.includes('Confidential solution text'), false);
  assert.equal(serialized.includes('Altered at 8 pm'), true);
  assert.equal(serialized.includes('Compare the ledger with the alibi.'), true);
});

test('active-case sanitizer supports a Mongoose model document', () => {
  const source = makeMystery();
  const caseDocument = new Case({
    title: source.title,
    premise: 'A painting disappears during a private exhibition.',
    story: source.story,
    difficulty: 'Easy',
    suspects: source.suspects,
    clues: source.clues.map((clue, index) => ({ ...clue, discovered: index === 0 })),
    hints: source.hints.map((hint, index) => ({ ...hint, unlocked: index === 0 })),
    solution: source.solution,
  });
  const serialized = JSON.stringify(sanitizeActiveCase(caseDocument));
  assert.equal(serialized.includes('solution'), false);
  assert.equal(serialized.includes(source.clues[0].description), true);
  assert.equal(serialized.includes(source.clues[1].description), false);
  assert.equal(serialized.includes(source.hints[0].text), true);
  assert.equal(serialized.includes(source.hints[1].text), false);
});

test('score helper follows the formula for all difficulties and both verdicts', () => {
  for (const [difficulty, config] of Object.entries(DIFFICULTY_CONFIG)) {
    const caseData = {
      difficulty,
      clues: Array.from({ length: config.clues }, () => ({ discovered: false })),
      hints: Array.from({ length: config.hints }, () => ({ unlocked: false })),
    };
    assert.deepEqual(calculateScore(caseData, true), {
      basePoints: config.basePoints, clueBonus: 0, hintPenalty: 0, total: config.basePoints,
    });
    assert.deepEqual(calculateScore(caseData, false), {
      basePoints: 0, clueBonus: 0, hintPenalty: 0, total: 0,
    });

    const investigatedCase = {
      difficulty,
      clues: Array.from({ length: config.clues }, (_, index) => ({ discovered: index < 3 })),
      hints: Array.from({ length: config.hints }, (_, index) => ({ unlocked: index < 2 })),
    };
    assert.deepEqual(calculateScore(investigatedCase, true), {
      basePoints: config.basePoints, clueBonus: 15, hintPenalty: 20, total: config.basePoints - 5,
    });
    assert.deepEqual(calculateScore(investigatedCase, false), {
      basePoints: 0, clueBonus: 15, hintPenalty: 20, total: 0,
    });
  }
});

test('score helper uses persisted counts, applies wrong-answer bonuses, and floors at zero', () => {
  assert.deepEqual(calculateScore({
    difficulty: 'Hard', clues: [{ discovered: true }, { discovered: true }, { discovered: true }], hints: [{ unlocked: true }],
  }, false), { basePoints: 0, clueBonus: 15, hintPenalty: 10, total: 5 });
  assert.deepEqual(calculateScore({
    difficulty: 'Medium', clues: [{ discovered: true }, { discovered: true }], hints: [{ unlocked: true }],
  }, false), { basePoints: 0, clueBonus: 10, hintPenalty: 10, total: 0 });
  assert.deepEqual(calculateScore({
    difficulty: 'Easy', clues: [{ discovered: true }], hints: [{ unlocked: true }, { unlocked: true }],
  }, false), { basePoints: 0, clueBonus: 5, hintPenalty: 20, total: 0 });
  assert.throws(() => calculateScore({ difficulty: 'Easy', clues: [], hints: [] }, 'true'));
  assert.throws(() => calculateScore({ difficulty: 'unknown', clues: [], hints: [] }, true));
});

test('Gemini service requests structured JSON and returns validated data', async () => {
  const mystery = makeMystery('Medium');
  const requests = [];
  const result = await generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Medium' }, {
    client: fakeClient([{ text: JSON.stringify(mystery) }], requests),
  });

  assert.equal(result.clues.length, 7);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  assert.equal(requests[0].config.responseMimeType, 'application/json');
  assert.equal(requests[0].config.responseSchema.properties.suspects.maxItems, '4');
  assert.match(requests[0].config.systemInstruction, /untrusted data/i);
  assert.match(requests[0].contents, /PLAYER_PREMISE_JSON=/);
});

test('Gemini service retries malformed JSON and schema failures once only', async () => {
  const requests = [];
  await generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }, {
    client: fakeClient(['not-json', { text: JSON.stringify(makeMystery()) }], requests),
  });
  assert.equal(requests.length, 2);
  assert.match(requests[1].contents, /Correction:/);

  const invalid = makeMystery();
  invalid.clues.pop();
  const validationRequests = [];
  await generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }, {
    client: fakeClient([{ text: JSON.stringify(invalid) }, { text: JSON.stringify(makeMystery()) }], validationRequests),
  });
  assert.equal(validationRequests.length, 2);
});

test('Gemini service bounds failed retries and hides raw provider errors', async () => {
  const requests = [];
  await assert.rejects(
    generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }, {
      client: fakeClient(['not-json', 'still-not-json'], requests),
    }),
    (error) => error instanceof MysteryGenerationError
      && error.status === 502
      && !error.message.includes('still-not-json'),
  );
  assert.equal(requests.length, 2);

  const providerRequests = [];
  await assert.rejects(
    generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }, {
      client: fakeClient([Object.assign(new Error('API key=private-value'), { status: 429 })], providerRequests),
    }),
    (error) => error.code === 'GEMINI_RATE_LIMITED'
      && error.status === 503
      && !error.message.includes('private-value'),
  );
  assert.equal(providerRequests.length, 1);
});

test('Gemini service rejects bad input and missing credentials without provider calls', async () => {
  let calls = 0;
  const client = { models: { async generateContent() { calls += 1; } } };
  await assert.rejects(generateMystery({ premise: 'short', difficulty: 'Easy' }, { client }), { code: 'INVALID_INPUT' });
  assert.equal(calls, 0);

  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }),
      { code: 'GEMINI_NOT_CONFIGURED', status: 503 },
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('Gemini timeout and unavailable errors are mapped to safe retryable service errors', async () => {
  for (const [providerError, expectedCode] of [
    [Object.assign(new Error('private timeout detail'), { name: 'TimeoutError' }), 'GEMINI_TIMEOUT'],
    [Object.assign(new Error('private server detail'), { status: 503 }), 'GEMINI_UNAVAILABLE'],
  ]) {
    await assert.rejects(
      generateMystery({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }, {
        client: fakeClient([providerError]),
      }),
      (error) => error.code === expectedCode
        && error.status === 503
        && !error.message.includes('private'),
    );
  }
});
