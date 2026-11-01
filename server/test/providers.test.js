import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_CONFIG, validateMysteryOutput } from '../utils/validators.js';
import { createAIService, getAIProvider, generateMystery as generateSelected } from '../services/aiService.js';
import { createOpenAISchema, generateMystery as generateOpenAI } from '../services/openaiService.js';

const originalEnv = Object.fromEntries(['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'GEMINI_API_KEY'].map((key) => [key, process.env[key]]));
after(() => Object.entries(originalEnv).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value));

function mystery(difficulty = 'Medium') {
  const c = DIFFICULTY_CONFIG[difficulty];
  return {
    title: 'The Clockwork Gallery', story: 'A painting disappears during a private exhibition.\n\nThe gallery was locked from inside.',
    suspects: Array.from({ length: c.suspects }, (_, i) => ({ suspectId: `S${i + 1}`, name: `Person ${i + 1}`, role: 'Curator', personality: 'Observant', motive: 'A debt', alibi: 'In the archive.' })),
    clues: Array.from({ length: c.clues }, (_, i) => ({ clueId: `C${i + 1}`, title: `Clue ${i + 1}`, location: 'Gallery', description: 'A detail in the timeline.' })),
    hints: Array.from({ length: c.hints }, (_, i) => ({ hintId: `H${i + 1}`, text: 'Compare the evidence.' })),
    solution: { culpritId: 'S1', supportingClueIds: ['C1', 'C2'], explanation: 'The evidence contradicts the alibi.' },
  };
}
function fakeClient(responses, requests = []) {
  let i = 0;
  return { responses: { async parse(request) { requests.push(request); const value = responses[i++]; if (value instanceof Error) throw value; return value; } } };
}
const input = { premise: 'A painting disappears from the gallery.', difficulty: 'Medium' };

test('Gemini remains the default provider', () => {
  delete process.env.AI_PROVIDER;
  assert.equal(getAIProvider(), 'gemini');
});

test('provider dispatch calls the selected provider and rejects unsupported configuration', async () => {
  const calls = [];
  const service = createAIService({ gemini: async () => { calls.push('gemini'); }, openai: async () => { calls.push('openai'); } });
  process.env.AI_PROVIDER = 'gemini'; await service.generateMystery(input);
  process.env.AI_PROVIDER = 'openai'; await service.generateMystery(input);
  assert.deepEqual(calls, ['gemini', 'openai']);
  process.env.AI_PROVIDER = 'vertex';
  assert.throws(() => getAIProvider(), { code: 'AI_PROVIDER_UNSUPPORTED' });
});

test('OpenAI uses the configured model, strict Zod structured output, and shared domain validation', async () => {
  const requests = [];
  process.env.OPENAI_API_KEY = 'test-only-key';
  delete process.env.GEMINI_API_KEY;
  process.env.OPENAI_MODEL = 'test-model';
  const result = await generateOpenAI(input, { client: fakeClient([{ output_parsed: mystery() }], requests) });
  assert.deepEqual(result, validateMysteryOutput(mystery(), 'Medium'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'test-model');
  assert.equal(requests[0].text.format.type, 'json_schema');
  assert.equal(requests[0].text.format.strict, true);
  assert.equal(createOpenAISchema('Medium').shape.suspects._def.type, 'array');
});

test('invalid structured content gets one bounded retry then a safe validation error', async () => {
  const invalid = mystery(); invalid.solution.culpritId = 'S5';
  const requests = [];
  await assert.rejects(generateOpenAI(input, { client: fakeClient([{ output_parsed: invalid }, { output_parsed: invalid }], requests) }), { code: 'MYSTERY_GENERATION_FAILED', status: 502 });
  assert.equal(requests.length, 2);
});

test('missing OpenAI key, refusal, incomplete responses, rate limits, and timeouts are handled safely', async () => {
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(generateOpenAI(input), { code: 'OPENAI_NOT_CONFIGURED', status: 503 });
  process.env.OPENAI_API_KEY = 'test-only-key';
  for (const [response, code, status] of [
    [{ output: [{ content: [{ type: 'refusal' }] }] }, 'OPENAI_REFUSAL', 502],
    [{ status: 'incomplete', incomplete_details: {} }, 'OPENAI_INCOMPLETE', 503],
  ]) await assert.rejects(generateOpenAI(input, { client: fakeClient([response]) }), { code, status });
  for (const [error, code] of [
    [Object.assign(new Error('sensitive api key detail'), { status: 429 }), 'OPENAI_RATE_LIMITED'],
    [Object.assign(new Error('secret timeout info'), { name: 'APIConnectionTimeoutError' }), 'OPENAI_TIMEOUT'],
  ]) await assert.rejects(generateOpenAI(input, { client: fakeClient([error]) }), (e) => e.code === code && !e.message.includes('secret'));
});

test('provider dispatch does not require the unused provider credentials and Gemini errors stay safe', async () => {
  process.env.AI_PROVIDER = 'openai';
  delete process.env.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only-key';
  const output = await createAIService({ openai: async () => 'openai' }).generateMystery(input);
  assert.equal(output, 'openai');
  await generateOpenAI(input, { client: fakeClient([{ output_parsed: mystery() }]) });
  process.env.AI_PROVIDER = 'gemini';
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal(await createAIService({ gemini: async () => 'gemini' }).generateMystery(input), 'gemini');
  await assert.rejects(generateSelected({ premise: 'A painting disappears from the gallery.', difficulty: 'Easy' }), (e) => e.code === 'GEMINI_NOT_CONFIGURED' && !e.message.includes('test-only-key'));
});
