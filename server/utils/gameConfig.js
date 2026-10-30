export const DIFFICULTY_CONFIG = Object.freeze({
  Easy: Object.freeze({ suspects: 3, clues: 5, hints: 2, basePoints: 100 }),
  Medium: Object.freeze({ suspects: 4, clues: 7, hints: 3, basePoints: 150 }),
  Hard: Object.freeze({ suspects: 5, clues: 9, hints: 3, basePoints: 200 }),
});

export const DIFFICULTIES = Object.freeze(Object.keys(DIFFICULTY_CONFIG));

export function getDifficultyConfig(difficulty) {
  return DIFFICULTY_CONFIG[difficulty] ?? null;
}
