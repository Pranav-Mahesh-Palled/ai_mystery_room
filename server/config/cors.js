export function allowedOrigins() {
  const configuredOrigins = (process.env.CLIENT_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    configuredOrigins.push('http://localhost:5173');
  }

  return new Set(configuredOrigins);
}
