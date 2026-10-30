import { getDifficultyConfig } from './gameConfig.js';

export function calculateScore(caseData, correctAccusation) {
  if (!caseData || typeof caseData !== 'object') {
    throw new TypeError('A persisted case is required to calculate a score.');
  }
  if (typeof correctAccusation !== 'boolean') {
    throw new TypeError('Accusation correctness must be a boolean.');
  }

  const difficulty = getDifficultyConfig(caseData.difficulty);
  if (!difficulty) throw new TypeError('Case difficulty is invalid.');
  if (!Array.isArray(caseData.clues) || !Array.isArray(caseData.hints)) {
    throw new TypeError('Persisted clues and hints are required to calculate a score.');
  }
  if (caseData.clues.some((clue) => !clue || typeof clue.discovered !== 'boolean')) {
    throw new TypeError('Every persisted clue must have a discovery state.');
  }
  if (caseData.hints.some((hint) => !hint || typeof hint.unlocked !== 'boolean')) {
    throw new TypeError('Every persisted hint must have an unlock state.');
  }

  const basePoints = correctAccusation ? difficulty.basePoints : 0;
  const clueBonus = caseData.clues.filter(({ discovered }) => discovered).length * 5;
  const hintPenalty = caseData.hints.filter(({ unlocked }) => unlocked).length * 10;
  const total = Math.max(0, basePoints + clueBonus - hintPenalty);

  return { basePoints, clueBonus, hintPenalty, total };
}
