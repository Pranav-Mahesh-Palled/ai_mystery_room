import express from 'express';
import cors from 'cors';
import { isDatabaseConnected } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { allowedOrigins } from './config/cors.js';
import { requestDiagnostics } from './middleware/requestDiagnostics.js';
import caseRoutes from './routes/caseRoutes.js';

const app = express();

app.disable('x-powered-by');
app.use(requestDiagnostics);
app.use(cors({
  origin(origin, callback) {
    // Requests from scripts and health checks have no Origin header.
    if (!origin || allowedOrigins().has(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error('This origin is not allowed to access the API.');
    error.status = 403;
    error.code = 'ORIGIN_NOT_ALLOWED';
    callback(error);
  },
}));
app.use(express.json({ limit: '16kb', strict: true }));

app.get('/api/health', (_request, response) => {
  const databaseConnected = isDatabaseConnected();
  const statusCode = databaseConnected ? 200 : 503;

  response.status(statusCode).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected',
  });
});

app.use('/api/cases', caseRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
