function asPlainObject(value) {
  if (value && typeof value.toObject === 'function') {
    return value.toObject({ depopulate: true });
  }
  return value;
}

export function sanitizeActiveCase(caseValue) {
  const caseData = asPlainObject(caseValue);
  if (!caseData || typeof caseData !== 'object') {
    throw new TypeError('A case object is required.');
  }

  return {
    caseId: String(caseData._id ?? caseData.caseId ?? ''),
    title: caseData.title,
    premise: caseData.premise,
    story: caseData.story,
    difficulty: caseData.difficulty,
    status: caseData.status,
    suspects: (caseData.suspects ?? []).map((suspect) => ({
      suspectId: suspect.suspectId,
      name: suspect.name,
      role: suspect.role,
      personality: suspect.personality,
      motive: suspect.motive,
      alibi: suspect.alibi,
    })),
    clues: (caseData.clues ?? []).map((clue) => (
      clue.discovered === true
        ? { clueId: clue.clueId, title: clue.title, location: clue.location, description: clue.description, discovered: true }
        : { clueId: clue.clueId, title: clue.title, location: clue.location, discovered: false }
    )),
    hints: (caseData.hints ?? []).map((hint) => (
      hint.unlocked === true
        ? { hintId: hint.hintId, text: hint.text, unlocked: true }
        : { hintId: hint.hintId, unlocked: false }
    )),
    createdAt: caseData.createdAt,
    updatedAt: caseData.updatedAt,
  };
}
