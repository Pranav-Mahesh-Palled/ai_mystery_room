import { Router } from 'express';
import { z } from 'zod';
import { createCaseController } from '../controllers/caseController.js';
import { generationRateLimiter } from '../middleware/rateLimiter.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { difficultySchema, premiseSchema } from '../utils/validators.js';

const caseId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid case ID is required.');
const suspectId = z.string().regex(/^S[1-5]$/, 'Choose a valid suspect ID.');
const clueId = z.string().regex(/^C[1-9]\d*$/, 'A valid clue ID is required.');

const createBody = z.object({ premise: premiseSchema, difficulty: difficultySchema }).strict();
const caseParams = z.object({ id: caseId }).strict();
const clueParams = z.object({ id: caseId, clueId }).strict();
const accusationBody = z.object({ suspectId }).strict();

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createCaseRouter({ controller = createCaseController(), generationLimiter = generationRateLimiter } = {}) {
  const router = Router();

  router.post('/', generationLimiter, validateRequest({ body: createBody }), asyncRoute(controller.createCase));
  router.get('/:id/result', validateRequest({ params: caseParams }), asyncRoute(controller.getResult));
  router.get('/:id', validateRequest({ params: caseParams }), asyncRoute(controller.getCase));
  router.post('/:id/clues/:clueId/discover', validateRequest({ params: clueParams }), asyncRoute(controller.discoverClue));
  router.post('/:id/hints', validateRequest({ params: caseParams }), asyncRoute(controller.requestHint));
  router.post('/:id/accuse', validateRequest({ params: caseParams, body: accusationBody }), asyncRoute(controller.accuse));

  return router;
}

export default createCaseRouter();
