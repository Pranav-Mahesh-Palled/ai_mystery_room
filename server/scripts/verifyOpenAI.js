import 'dotenv/config';
import { DIFFICULTY_CONFIG } from '../utils/gameConfig.js';
import { generateMystery } from '../services/openaiService.js';

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('Set OPENAI_API_KEY in server/.env before running this check.');
    process.exitCode = 1;
    return;
  }

  try {
    const difficulty = 'Medium';
    const expected = DIFFICULTY_CONFIG[difficulty];
    const mystery = await generateMystery({
      premise: 'A silver pocket watch disappears from a locked museum gallery.',
      difficulty,
    });
    const clueIds = new Set(mystery.clues.map(({ clueId }) => clueId));
    const culpritValid = mystery.suspects.some(({ suspectId }) => suspectId === mystery.solution.culpritId);
    const supportingValid = mystery.solution.supportingClueIds.length >= 2
      && new Set(mystery.solution.supportingClueIds).size === mystery.solution.supportingClueIds.length
      && mystery.solution.supportingClueIds.every((id) => clueIds.has(id));
    const countsValid = mystery.suspects.length === expected.suspects
      && mystery.clues.length === expected.clues
      && mystery.hints.length === expected.hints;
    if (!countsValid || !culpritValid || !supportingValid) throw new Error('Validation failed');
    console.log(`OpenAI verification passed (${process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna'}): ${expected.suspects} suspects, ${expected.clues} clues, ${expected.hints} hints; culprit and clue references valid.`);
  } catch (error) {
    const code = /^[A-Z0-9_]{1,50}$/.test(error?.code ?? '') ? error.code : 'GENERATION_CHECK_FAILED';
    console.error(`OpenAI verification failed safely (${code}).`);
    process.exitCode = 1;
  }
}

await main();
