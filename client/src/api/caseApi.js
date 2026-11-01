import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

function unwrap(request) {
  return request.then(({ data }) => data);
}

export const caseApi = {
  createMystery({ premise, difficulty }) {
    // Provider calls can take 45 seconds per attempt, with one bounded retry.
    return unwrap(api.post('/cases', { premise, difficulty }, { timeout: 100_000 }));
  },
  getCase(caseId, config) {
    return unwrap(api.get(`/cases/${encodeURIComponent(caseId)}`, config));
  },
  discoverClue(caseId, clueId) {
    return unwrap(api.post(`/cases/${encodeURIComponent(caseId)}/clues/${encodeURIComponent(clueId)}/discover`));
  },
  requestHint(caseId, requestKey) {
    return unwrap(api.post(`/cases/${encodeURIComponent(caseId)}/hints`, undefined, {
      headers: requestKey ? { 'Idempotency-Key': requestKey } : undefined,
    }));
  },
  accuse(caseId, suspectId) {
    return unwrap(api.post(`/cases/${encodeURIComponent(caseId)}/accuse`, { suspectId }));
  },
  getResult(caseId, config) {
    return unwrap(api.get(`/cases/${encodeURIComponent(caseId)}/result`, config));
  },
};

export function getApiErrorCode(error) {
  return error?.response?.data?.error?.code ?? null;
}

export function getApiErrorMessage(error) {
  if (!error?.response) {
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
      return 'This request is taking longer than expected. Please try again; it may still finish saving.';
    }
    return 'The case server could not be reached. Check your connection and try again.';
  }

  const code = getApiErrorCode(error);
  if (code === 'RATE_LIMITED') return 'Too many new cases were requested. Please wait a little and try again.';
  if (['DATABASE_UNAVAILABLE', 'DATABASE_ERROR', 'GEMINI_UNAVAILABLE', 'GEMINI_TIMEOUT', 'GEMINI_RATE_LIMITED', 'GEMINI_NOT_CONFIGURED', 'OPENAI_UNAVAILABLE', 'OPENAI_TIMEOUT', 'OPENAI_RATE_LIMITED', 'OPENAI_NOT_CONFIGURED', 'OPENAI_INCOMPLETE'].includes(code)) {
    return 'The case room is temporarily unavailable. Your information is still here; please try again shortly.';
  }
  if (code === 'CASE_NOT_FOUND' || code === 'CLUE_NOT_FOUND') return 'This case could not be found. It may have expired or the link may be incomplete.';
  if (code === 'MYSTERY_GENERATION_FAILED') return 'The mystery could not be assembled this time. Your premise is still here; please try again.';
  if (code === 'NO_HINTS_REMAINING') return 'You have used every hint in this case.';
  if (code === 'CASE_COMPLETED') return 'This investigation has already been completed.';
  if (code === 'INVALID_SUSPECT') return 'Choose one of the suspects shown in this case.';

  const message = error.response.data?.error?.message;
  if (typeof message === 'string' && message.length < 180) return message;
  if (error.response.status >= 500) return 'Something went wrong on the case server. Please try again.';
  return 'That request could not be completed. Check the information and try again.';
}
