import 'dotenv/config';
import { DIFFICULTY_CONFIG } from '../utils/gameConfig.js';
import { generateMystery } from '../services/geminiService.js';

const premise = 'A silver pocket watch disappears from a locked museum gallery.';

async function main() {
  if (!process.env.GEMINI_API_KEY?.trim() || !process.env.GEMINI_MODEL?.trim()) {
    console.error('Set GEMINI_API_KEY and GEMINI_MODEL in server/.env before running this check.');
    process.exitCode = 1;
    return;
  }

  for (const [difficulty, expected] of Object.entries(DIFFICULTY_CONFIG)) {
    try {
      const mystery = await generateMystery({ premise, difficulty });
      const clueIds = new Set(mystery.clues.map((clue) => clue.clueId));
      const supportingReferencesValid = mystery.solution.supportingClueIds.length >= 2
        && new Set(mystery.solution.supportingClueIds).size === mystery.solution.supportingClueIds.length
        && mystery.solution.supportingClueIds.every((clueId) => clueIds.has(clueId));
      const culpritReferenceValid = mystery.suspects.some((suspect) => suspect.suspectId === mystery.solution.culpritId);
      const countsValid = mystery.suspects.length === expected.suspects
        && mystery.clues.length === expected.clues
        && mystery.hints.length === expected.hints;

      if (!countsValid || !supportingReferencesValid || !culpritReferenceValid) {
        throw new Error('Generated content did not satisfy the validated contract.');
      }
      console.log(`${difficulty}: authentication/model request and structured output validated (${expected.suspects} suspects, ${expected.clues} clues, ${expected.hints} hints).`);
    } catch (error) {
      const safeCode = /^[A-Z0-9_]{1,50}$/.test(error?.code ?? '') ? error.code : 'GENERATION_CHECK_FAILED';
      console.error(`${difficulty}: failed safely (${safeCode}).`);
      process.exitCode = 1;
      return;
    }
  }
}

await main();
