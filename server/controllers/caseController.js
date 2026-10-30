import Case from '../models/Case.js';
import { isDatabaseConnected } from '../config/db.js';
import { generateMystery, MysteryGenerationError } from '../services/geminiService.js';
import { validateMysteryOutput } from '../utils/validators.js';
import { sanitizeActiveCase } from '../utils/sanitizer.js';
import { calculateScore } from '../utils/scoring.js';

const MAX_CONCURRENCY_RETRIES = 3;

function apiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function requireDatabase(dbIsReady) {
  if (!dbIsReady()) {
    throw apiError(503, 'DATABASE_UNAVAILABLE', 'The case service is temporarily unavailable. Please try again shortly.');
  }
}

function databaseError(error, dbIsReady) {
  if (error?.name === 'VersionError') return error;
  const connectionErrorNames = new Set([
    'MongoNetworkError',
    'MongoNotConnectedError',
    'MongoTopologyClosedError',
    'MongooseServerSelectionError',
  ]);
  if (!dbIsReady() || connectionErrorNames.has(error?.name)) {
    return apiError(503, 'DATABASE_UNAVAILABLE', 'The case service is temporarily unavailable. Please try again shortly.');
  }
  return apiError(500, 'DATABASE_ERROR', 'The case could not be saved. Please try again.');
}

function isVersionConflict(error) {
  return error?.name === 'VersionError';
}

function idFor(caseDocument) {
  return String(caseDocument._id ?? caseDocument.id);
}

function clueResponse(caseDocument, clue) {
  return {
    clue: {
      clueId: clue.clueId,
      title: clue.title,
      location: clue.location,
      description: clue.description,
      discovered: true,
    },
    discoveredCluesCount: caseDocument.clues.filter((item) => item.discovered === true).length,
  };
}

function hintResponse(caseDocument, hint) {
  const unlockedHintsCount = caseDocument.hints.filter((item) => item.unlocked === true).length;
  return {
    hint: { hintId: hint.hintId, text: hint.text, unlocked: true },
    unlockedHintsCount,
    remainingHints: caseDocument.hints.length - unlockedHintsCount,
  };
}

function ensureActive(caseDocument) {
  if (caseDocument.status !== 'active') {
    throw apiError(400, 'CASE_COMPLETED', 'This case is already complete; no more investigation changes are allowed.');
  }
}

function nextLockedHint(caseDocument) {
  return caseDocument.hints
    .filter((hint) => hint.unlocked !== true)
    .sort((left, right) => Number(left.hintId.slice(1)) - Number(right.hintId.slice(1)))[0];
}

export function createCaseController({
  CaseModel = Case,
  generateContent = generateMystery,
  dbIsReady = isDatabaseConnected,
  now = () => new Date(),
} = {}) {
  const inFlightHintRequests = new Map();

  async function findCase(id) {
    requireDatabase(dbIsReady);
    try {
      const caseDocument = await CaseModel.findById(id);
      if (!caseDocument) throw apiError(404, 'CASE_NOT_FOUND', 'That mystery case could not be found.');
      return caseDocument;
    } catch (error) {
      if (error.status) throw error;
      throw databaseError(error, dbIsReady);
    }
  }

  async function unlockNextHint(id, requestKey) {
    let targetHintId;

    for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt += 1) {
      const caseDocument = await findCase(id);
      ensureActive(caseDocument);

      if (requestKey) {
        const previousRequest = caseDocument.hints.find((hint) => hint.requestKey === requestKey && hint.unlocked === true);
        if (previousRequest) return hintResponse(caseDocument, previousRequest);
      }

      // When two requests read the same version, return the hint the first one
      // just unlocked instead of consuming the next hint as a duplicate action.
      if (targetHintId) {
        const alreadyUnlocked = caseDocument.hints.find((hint) => hint.hintId === targetHintId && hint.unlocked === true);
        if (alreadyUnlocked) return hintResponse(caseDocument, alreadyUnlocked);
      }

      const hint = nextLockedHint(caseDocument);
      if (!hint) throw apiError(400, 'NO_HINTS_REMAINING', 'There are no hints left for this case.');
      targetHintId ??= hint.hintId;
      hint.unlocked = true;
      if (requestKey) hint.requestKey = requestKey;

      try {
        await caseDocument.save();
        return hintResponse(caseDocument, hint);
      } catch (error) {
        if (isVersionConflict(error)) continue;
        throw databaseError(error, dbIsReady);
      }
    }

    throw apiError(409, 'CASE_CHANGED', 'This case changed while the hint was being unlocked. Please try again.');
  }

  return {
    async createCase(request, response) {
      requireDatabase(dbIsReady);
      const { premise, difficulty } = request.body;
      let content;
      try {
        const generated = await generateContent({ premise, difficulty });
        content = validateMysteryOutput(generated, difficulty);
      } catch (error) {
        if (error instanceof MysteryGenerationError) throw error;
        throw apiError(502, 'MYSTERY_GENERATION_FAILED', 'The mystery could not be generated. Please try again.');
      }

      const caseDocument = new CaseModel({
        title: content.title,
        premise,
        story: content.story,
        difficulty,
        status: 'active',
        suspects: content.suspects,
        clues: content.clues.map((clue) => ({ ...clue, discovered: false })),
        hints: content.hints.map((hint) => ({ ...hint, unlocked: false })),
        solution: content.solution,
        accusation: null,
        scoreBreakdown: null,
      });

      try {
        await caseDocument.save();
      } catch (error) {
        throw databaseError(error, dbIsReady);
      }

      response.status(201).json({
        caseId: idFor(caseDocument),
        title: caseDocument.title,
        difficulty: caseDocument.difficulty,
      });
    },

    async getCase(request, response) {
      const caseDocument = await findCase(request.params.id);
      response.json(sanitizeActiveCase(caseDocument));
    },

    async discoverClue(request, response) {
      const { id, clueId } = request.params;

      for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt += 1) {
        const caseDocument = await findCase(id);
        ensureActive(caseDocument);
        const clue = caseDocument.clues.find((item) => item.clueId === clueId);
        if (!clue) throw apiError(404, 'CLUE_NOT_FOUND', 'That clue does not exist in this case.');
        if (clue.discovered === true) {
          response.json(clueResponse(caseDocument, clue));
          return;
        }

        clue.discovered = true;
        try {
          await caseDocument.save();
          response.json(clueResponse(caseDocument, clue));
          return;
        } catch (error) {
          if (isVersionConflict(error)) continue;
          throw databaseError(error, dbIsReady);
        }
      }

      throw apiError(409, 'CASE_CHANGED', 'This case changed while the clue was being recorded. Please try again.');
    },

    async requestHint(request, response) {
      const { id } = request.params;
      const requestKey = request.get('Idempotency-Key');
      if (requestKey && (!/^[\w-]{16,100}$/.test(requestKey))) {
        throw apiError(400, 'INVALID_INPUT', 'The hint request identifier is invalid.');
      }
      let pending = inFlightHintRequests.get(id);
      if (!pending) {
        pending = unlockNextHint(id, requestKey);
        inFlightHintRequests.set(id, pending);
      }

      try {
        response.json(await pending);
      } finally {
        if (inFlightHintRequests.get(id) === pending) inFlightHintRequests.delete(id);
      }
    },

    async accuse(request, response) {
      const { id } = request.params;
      const { suspectId } = request.body;

      for (let attempt = 0; attempt < MAX_CONCURRENCY_RETRIES; attempt += 1) {
        const caseDocument = await findCase(id);
        ensureActive(caseDocument);
        if (!caseDocument.suspects.some((suspect) => suspect.suspectId === suspectId)) {
          throw apiError(400, 'INVALID_SUSPECT', 'Choose a suspect from this case.');
        }

        const isCorrect = suspectId === caseDocument.solution.culpritId;
        let scoreBreakdown;
        try {
          scoreBreakdown = calculateScore(caseDocument, isCorrect);
        } catch {
          throw apiError(500, 'INVALID_CASE_STATE', 'This case could not be completed. Please try again.');
        }

        caseDocument.accusation = { suspectId, isCorrect, submittedAt: now() };
        caseDocument.scoreBreakdown = scoreBreakdown;
        caseDocument.status = 'completed';

        try {
          await caseDocument.save();
          response.json({
            caseId: idFor(caseDocument),
            status: 'completed',
            isCorrect,
            scoreBreakdown: { ...scoreBreakdown },
          });
          return;
        } catch (error) {
          if (isVersionConflict(error)) continue;
          throw databaseError(error, dbIsReady);
        }
      }

      throw apiError(409, 'CASE_CHANGED', 'This case changed during your accusation. Please try again.');
    },

    async getResult(request, response) {
      const caseDocument = await findCase(request.params.id);
      if (caseDocument.status !== 'completed') {
        throw apiError(403, 'CASE_NOT_COMPLETED', 'Submit your accusation before viewing the solution.');
      }

      const accusation = caseDocument.accusation;
      const scoreBreakdown = caseDocument.scoreBreakdown;
      if (!accusation || !scoreBreakdown) {
        throw apiError(500, 'INVALID_CASE_STATE', 'The completed case result is unavailable.');
      }

      const accusedSuspect = caseDocument.suspects.find((suspect) => suspect.suspectId === accusation.suspectId);
      const culprit = caseDocument.suspects.find((suspect) => suspect.suspectId === caseDocument.solution.culpritId);
      const supportingIds = new Set(caseDocument.solution.supportingClueIds);
      const supportingClues = caseDocument.clues
        .filter((clue) => supportingIds.has(clue.clueId))
        .map(({ clueId, title, location, description }) => ({ clueId, title, location, description }));

      if (!accusedSuspect || !culprit) {
        throw apiError(500, 'INVALID_CASE_STATE', 'The completed case result is unavailable.');
      }

      response.json({
        caseId: idFor(caseDocument),
        title: caseDocument.title,
        difficulty: caseDocument.difficulty,
        accusation: {
          suspectId: accusation.suspectId,
          suspect: { suspectId: accusedSuspect.suspectId, name: accusedSuspect.name, role: accusedSuspect.role },
        },
        isCorrect: accusation.isCorrect,
        trueCulprit: {
          suspectId: culprit.suspectId,
          name: culprit.name,
          role: culprit.role,
          motive: culprit.motive,
          alibi: culprit.alibi,
        },
        solution: {
          explanation: caseDocument.solution.explanation,
          supportingClues,
        },
        finalScore: scoreBreakdown.total,
        scoreBreakdown: {
          basePoints: scoreBreakdown.basePoints,
          clueBonus: scoreBreakdown.clueBonus,
          hintPenalty: scoreBreakdown.hintPenalty,
          total: scoreBreakdown.total,
        },
      });
    },
  };
}
