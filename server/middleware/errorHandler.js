export function notFoundHandler(_request, _response, next) {
  const error = new Error('The requested resource was not found.');
  error.status = 404;
  error.code = 'NOT_FOUND';
  next(error);
}

export function errorHandler(error, _request, response, _next) {
  if (response.headersSent) return;

  let status = Number.isInteger(error.status) ? error.status : 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Something went wrong. Please try again.';

  if (error.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'The request body must contain valid JSON.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'The request body is too large.';
  } else if (!Number.isInteger(error.status) || status < 400 || status > 599 || (status >= 500 && error.expose !== true)) {
    status = 500;
    code = 'INTERNAL_ERROR';
    message = 'Something went wrong. Please try again.';
  }

  if (process.env.NODE_ENV !== 'production' && status === 500) {
    console.error('Unhandled request error.');
  }

  const errorBody = { code, message };
  if (status < 500 && Array.isArray(error.details)) {
    errorBody.details = error.details;
  }

  response.status(status).json({ error: errorBody });
}
