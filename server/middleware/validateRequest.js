import { ZodError } from 'zod';

export function validateRequest(schemas) {
  return (request, _response, next) => {
    try {
      for (const part of ['body', 'params', 'query']) {
        const schema = schemas[part];
        if (!schema) continue;
        request[part] = schema.parse(request[part]);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        const validationError = new Error('Please check the submitted information.');
        validationError.status = 400;
        validationError.code = 'INVALID_INPUT';
        validationError.details = details;
        next(validationError);
        return;
      }
      next(error);
    }
  };
}
