import { z } from 'zod';
import { DIFFICULTY_CONFIG, DIFFICULTIES, getDifficultyConfig } from './gameConfig.js';

const text = (maxLength) => z.string().trim().min(1).max(maxLength);
const suspectId = z.string().regex(/^S[1-5]$/);
const clueId = z.string().regex(/^C[1-9]\d*$/);
const hintId = z.string().regex(/^H[1-3]$/);

const suspectSchema = z.object({
  suspectId,
  name: text(80),
  role: text(100),
  personality: text(240),
  motive: text(500),
  alibi: text(500),
}).strict();

const clueSchema = z.object({
  clueId,
  title: text(100),
  location: text(120),
  description: text(1000),
}).strict();

const hintSchema = z.object({
  hintId,
  text: text(500),
}).strict();

const solutionSchema = z.object({
  culpritId: suspectId,
  supportingClueIds: z.array(clueId).min(2),
  explanation: text(2000),
}).strict();

export const premiseSchema = z.string().trim().min(10).max(300);
export const difficultySchema = z.enum(DIFFICULTIES);

export function createMysteryContentSchema(difficulty) {
  const counts = getDifficultyConfig(difficulty);
  if (!counts) throw new TypeError('Difficulty must be Easy, Medium, or Hard.');

  return z.object({
    title: text(120),
    story: text(5000),
    suspects: z.array(suspectSchema).length(counts.suspects),
    clues: z.array(clueSchema).length(counts.clues),
    hints: z.array(hintSchema).length(counts.hints),
    solution: solutionSchema,
  }).strict().superRefine((mystery, context) => {
    assertSequentialIds(mystery.suspects, 'suspectId', 'S', context);
    assertSequentialIds(mystery.clues, 'clueId', 'C', context);
    assertSequentialIds(mystery.hints, 'hintId', 'H', context);

    const suspectIds = new Set(mystery.suspects.map(({ suspectId: id }) => id));
    if (!suspectIds.has(mystery.solution.culpritId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['solution', 'culpritId'], message: 'Culprit must reference a generated suspect.' });
    }

    const supportingIds = mystery.solution.supportingClueIds;
    if (new Set(supportingIds).size !== supportingIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['solution', 'supportingClueIds'], message: 'Supporting clue IDs must be unique.' });
    }

    const clueIds = new Set(mystery.clues.map(({ clueId: id }) => id));
    supportingIds.forEach((id, index) => {
      if (!clueIds.has(id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['solution', 'supportingClueIds', index], message: 'Supporting clue must reference a generated clue.' });
      }
    });
  });
}

function assertSequentialIds(items, field, prefix, context) {
  const seen = new Set();
  items.forEach((item, index) => {
    const id = item[field];
    if (seen.has(id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field === 'suspectId' ? 'suspects' : field === 'clueId' ? 'clues' : 'hints', index, field], message: 'IDs must be unique within each collection.' });
    }
    seen.add(id);

    if (id !== `${prefix}${index + 1}`) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field === 'suspectId' ? 'suspects' : field === 'clueId' ? 'clues' : 'hints', index, field], message: `IDs must follow the ${prefix}1, ${prefix}2 sequence.` });
    }
  });
}

export function validateMysteryOutput(output, difficulty) {
  return createMysteryContentSchema(difficulty).parse(output);
}

export { DIFFICULTY_CONFIG, DIFFICULTIES, getDifficultyConfig };
