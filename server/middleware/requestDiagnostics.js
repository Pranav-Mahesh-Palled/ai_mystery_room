import { randomUUID } from 'node:crypto';

export function requestDiagnostics(request, response, next) {
  request.requestId = randomUUID();
  request.generationDiagnostics = null;
  response.setHeader('X-Request-ID', request.requestId);

  if (request.method === 'POST' && request.path === '/api/cases') {
    request.generationDiagnostics = {
      requestId: request.requestId,
      method: request.method,
      route: '/api/cases',
      provider: null,
      databaseAvailable: null,
      controllerReached: false,
      providerGenerationSucceeded: false,
      validationSucceeded: false,
      persistenceSucceeded: false,
      errorCategory: null,
    };
    response.once('finish', () => {
      const diagnostic = request.generationDiagnostics;
      if (!diagnostic) return;
      console.info(JSON.stringify({
        event: 'case_generation_request',
        ...diagnostic,
        status: response.statusCode,
        errorCategory: diagnostic.errorCategory ?? (response.statusCode >= 400 ? `HTTP_${response.statusCode}` : null),
      }));
    });
  }
  next();
}
