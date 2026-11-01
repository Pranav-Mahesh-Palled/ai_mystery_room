# AI Mystery Room

An anonymous detective game. Players provide a premise, choose a difficulty, examine clues, optionally request hints, make one accusation, and receive the server-calculated result. A case ID is a shareable game-session link; it is not authentication or a privacy boundary.

## Features

- Gemini-generated mysteries by default, with OpenAI as an optional backend provider; both outputs are validated against the selected difficulty.
- Easy, Medium, and Hard cases with server-owned gameplay state and scoring.
- Active-case responses hide the solution, locked hint text, and undiscovered clue descriptions.
- React investigation, accusation, and results screens with responsive layouts.
- Express API backed by MongoDB/Mongoose, with rate-limited generation and guarded state transitions.

## Project layout

- `client/` — React 18, Vite, React Router, Axios, Tailwind CSS utilities, and the custom case-file design system.
- `server/` — Express routes/controllers, Gemini service, Mongoose model, validation, scoring, and sanitization.
- `spec.md` — product and API requirements.

## Requirements and local setup

Use Node.js 20 or newer and npm. MongoDB and the API key for the selected provider are required to run the complete local game. Copy the example files to `.env` and set private values locally; provider keys and model settings belong only in the server environment, never in a `VITE_*` variable.

1. In `server/`, copy `.env.example` to `.env` and set `MONGODB_URI`. Gemini remains the default (`AI_PROVIDER=gemini`); set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (`gemini-3.8-flash`). To use OpenAI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` (`gpt-6-luna`). Only the selected provider needs a key. Switching `AI_PROVIDER` does not require application code changes.
2. In `client/`, copy `.env.example` to `.env`; set `VITE_API_BASE_URL` if the API is not at `http://localhost:5000/api`.
3. Install dependencies with `npm install` in both `server/` and `client/`.
4. Start the API with `npm run dev` in `server/`, then start the client with `npm run dev` in `client/`.
5. Open the Vite URL (normally `http://localhost:5173`). The backend allows this local origin during development.

## Environment variables

| Variable | Location | Purpose |
| --- | --- | --- |
| `PORT` | Server | HTTP port (defaults to `5000`). |
| `MONGODB_URI` | Server | MongoDB connection string. |
| `AI_PROVIDER` | Server | `gemini` (default) or `openai`; provider selection stays on the backend. |
| `GEMINI_API_KEY` | Server | Gemini credential; keep private. |
| `GEMINI_MODEL` | Server | Gemini model ID; defaults in `.env.example`. |
| `OPENAI_API_KEY` | Server | OpenAI API credential; keep private. |
| `OPENAI_MODEL` | Server | OpenAI model ID; defaults to `gpt-6-luna`. |
| `CLIENT_URL` | Server | Allowed frontend origin(s), comma-separated. |
| `NODE_ENV` | Server | Runtime environment. |
| `VITE_API_BASE_URL` | Client | Public API base URL compiled into the frontend. |

## Commands

Run commands from the relevant directory:

| Directory | Command | Purpose |
| --- | --- | --- |
| `server/` | `npm run dev` | Start the API with Node watch mode. |
| `server/` | `npm start` | Start the API. |
| `server/` | `npm test` | Run backend unit and route/controller tests. These use a test-only in-memory model and mocked generation; they do not require Gemini or MongoDB credentials. |
| `client/` | `npm run dev` | Start the Vite development server. |
| `client/` | `npm run build` | Create the frontend production build. |
| `client/` | `npm run preview` | Serve the production build locally. |
| `client/` | `npm test` | Run Chromium browser tests with test-only API responses. |
| `client/` | `npm run test:e2e:ui` | Open the Playwright UI test runner. |

The Playwright suite uses Chromium and deterministic, test-only API responses; it does not call Gemini or MongoDB. Install its browser once with `npx playwright install chromium`. Browser screenshots are saved under `client/test-artifacts/screenshots/`. The backend route tests exercise real Express routes/controllers but use an in-memory test model; they do not establish live MongoDB behavior. No lint script is configured.

### Optional live OpenAI check

After configuring `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` in `server/.env`, run `npm run verify:openai` from `server/` to make one Medium-difficulty mystery request. It validates the returned mystery and prints only counts and verification status; it does not save a case or print story/solution content. Do not run it until ready to incur API usage. OpenAI API billing is separate from ChatGPT subscriptions. Automated tests mock both providers and make no paid API calls.

### Optional live Gemini check

After configuring `GEMINI_API_KEY` and `GEMINI_MODEL` in `server/.env`, check the model against real structured-output generation for all three difficulty levels with `npm run verify:gemini` from `server/`. This makes three provider requests and may incur usage charges. The script does not save cases or print generated mystery content, API keys, or provider error details. Review your provider usage limits before running it. Routine tests do not call Gemini.

## API overview

All endpoints use the `/api` prefix. Errors use `{ "error": { "code", "message" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Report process/database readiness. |
| `POST` | `/cases` | Generate and save a mystery. |
| `GET` | `/cases/:id` | Get the sanitized active-game view. |
| `POST` | `/cases/:id/clues/:clueId/discover` | Discover a clue (idempotent). |
| `POST` | `/cases/:id/hints` | Unlock the next hint. Optional `Idempotency-Key` makes a retried request return the same hint. |
| `POST` | `/cases/:id/accuse` | Submit the one final accusation. |
| `GET` | `/cases/:id/result` | Get the result after the case is completed; active cases receive `403`. |

## Verification status

Latest local verification (31 October 2026): 38 backend tests passed, 15 Chromium browser tests passed, 23 server JavaScript syntax checks passed, and the frontend production build passed. Full client and server `npm audit` checks reported zero vulnerabilities. Provider tests use mocked responses; no live Gemini or OpenAI requests were made, and deployed production URLs have not been verified. Browser tests use test-only API responses and do not establish live MongoDB behavior.

Screenshots: [Home, mobile](client/test-artifacts/screenshots/home-mobile-375.png), [Create, mobile](client/test-artifacts/screenshots/create-mobile-375.png), [Investigation, mobile](client/test-artifacts/screenshots/investigation-mobile-375.png), [Accusation, mobile](client/test-artifacts/screenshots/accusation-mobile-375.png), [Results, mobile](client/test-artifacts/screenshots/results-mobile-375.png); corresponding desktop screenshots are in the same directory with the `desktop-1366` suffix.

`npm audit` currently reports advisories in the existing Vite/esbuild, React Router, and Zod dependency lines. The suggested fixes require major-version changes, so dependencies were not force-upgraded during this verification setup. Review and schedule those upgrades before production deployment.

### Dependency and styling update

The client uses Tailwind CSS v4 through the official Vite plugin for structural utility classes while retaining its existing custom visual styles. Tailwind Preflight is intentionally omitted to preserve the existing design. Vite/esbuild, React Router, and Zod were updated to patched releases; the React Router and Zod updates cross a major version. The application uses supported declarative React Router APIs and Zod APIs that remain available in Zod 4.

Both client and server `npm audit` checks report zero vulnerabilities. The credential-shaped entries previously present in `server/.env.example` were replaced with placeholders; `server/.env` is absent and ignored by Git. If those former values were real, rotate the MongoDB and Gemini credentials before using them.

## Deployment

Production deployment has **not** been created or verified. This section prepares the settings for the target architecture: GitHub source, MongoDB Atlas, a Render Web Service, and a Vercel Vite frontend. Do not treat local tests or a successful build as proof that live services work.

### 1. Prepare the GitHub repository

The project-local Git root is this `AI Mystery Room` directory. The repository currently has no remote and its files have not been staged or committed. Create an empty GitHub repository (do not initialize it with a second README or `.gitignore`), then review `git status` and confirm no local `.env` file is staged. From this directory, the commands to publish the source are:

```sh
git add .
git diff --cached --check
git status --short
git commit -m "Prepare AI Mystery Room for deployment"
git remote add origin https://github.com/<your-account>/<repository>.git
git push -u origin main
```

Review the staged file list before committing. The root `.gitignore` excludes `.env` files, `node_modules`, `client/dist`, and generated test output; `.env.example` files are intentionally included. The repository should contain `spec.md`, this README, both package manifests and lockfiles, and the complete `client/` and `server/` trees.

### 2. Configure MongoDB Atlas

1. Create or select an Atlas cluster in a region near the planned Render service.
2. Create a dedicated database user for this app. Grant the `readWrite` role only on the `ai_mystery_room` database; do not use an Atlas project owner or personal administrator account for the application.
3. In Atlas, add the `ai_mystery_room` database (Mongoose will create its collections on first write if needed).
4. Copy the Atlas driver connection string and set its database path to `ai_mystery_room`. URL-encode reserved characters in the database user's password. Store the complete value only as Render's `MONGODB_URI` secret.
5. In Network Access, allow the outbound IP ranges displayed for the selected Render service and region where available. Do not use `0.0.0.0/0`. Since the service does not exist yet, its applicable egress addresses cannot be verified from this repository; obtain them from the Render service dashboard after creating it. If a narrow allowlist cannot be established, resolve the networking approach before deployment rather than opening Atlas to every address.

### 3. Create the Render backend

Create a **Web Service** from the GitHub repository with these settings:

| Setting | Value |
| --- | --- |
| Root directory | `server` |
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/api/health` |

`npm start` runs the existing production entry point, `node index.js`. The server listens on Render's `PORT` and binds to `0.0.0.0`; outside Render it falls back to port `5000`. Render supplies `PORT`; do not hard-code or override it.

Add these variables in the Render service's Environment settings. Enter real values in the dashboard only; do not paste them into GitHub or Vercel.

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas connection string for the `ai_mystery_room` database; secret |
| `GEMINI_API_KEY` | A key authorized for the Gemini API; secret |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `AI_PROVIDER` | `gemini` (default) or `openai` |
| `OPENAI_API_KEY` | OpenAI API key; secret when OpenAI is selected |
| `OPENAI_MODEL` | `gpt-6-luna` |
| `CLIENT_URL` | The Vercel production origin, such as `https://<project>.vercel.app`; no path or trailing slash |
| `PORT` | Supplied by Render; do not set a fixed value |

`CLIENT_URL` accepts a comma-separated list of exact origins if both a Vercel production domain and another approved frontend origin are needed. In production, localhost is not added automatically and arbitrary origins are rejected. The health endpoint returns `200` only while Mongoose reports the database connected; otherwise it returns `503` with database readiness marked unavailable. Startup/database failures are logged without printing the connection string.

### 4. Create the Vercel frontend

Import the same GitHub repository into Vercel and set:

| Setting | Value |
| --- | --- |
| Root directory | `client` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci` |

Set this environment variable for the Production environment (and Preview only if that preview should call the production API):

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<render-service>.onrender.com/api` |

The client API module appends paths such as `/cases`, so the value **must include `/api` exactly once** and must not have a trailing slash. This is a public build-time URL. Never add `MONGODB_URI` or either provider key/model setting to Vercel. Redeploy the frontend after changing this build-time variable. The Vercel rewrite sends nested paths to `/index.html`; React Router handles the five application routes and renders its not-found screen for unknown paths.

### 5. Production preflight and manual verification

After the dashboards are configured and both services deploy, check these in order:

1. Open `https://<render-service>.onrender.com/api/health`. Expect HTTP `200` and `{"status":"ok","database":"connected"}`. A `503` means the backend is up but the database is not ready; check `MONGODB_URI`, the Atlas database user/database name, and the Atlas network allowlist.
2. Open the Vercel production URL and directly load and refresh `/`, `/create`, `/cases/<case-id>`, `/cases/<case-id>/accuse`, and `/cases/<case-id>/result`. The case routes require an existing ID and state; unknown paths should show the app's not-found screen.
3. Confirm the browser's API requests go to the Render URL with one `/api` prefix. A browser CORS error usually means `CLIENT_URL` does not exactly match the Vercel origin; update it and redeploy Render.
4. Complete the production checks in `spec.md` for Easy, Medium, and Hard, including refresh persistence, hint limits, accusation, and results. Inspect active-game Network responses to ensure the solution, undiscovered clue descriptions, locked hint text, and final score remain hidden.
5. Live mystery generation calls the selected provider and may incur charges. Do not run either provider verification script or submit a production generation request until ready to make live API requests. Automated tests use mocks and do not verify Atlas or provider connectivity.

Common configuration failures:

- Render reports no open port: confirm it is running `npm start` and that the listener uses `PORT` and `0.0.0.0`.
- Health returns `503`: check Atlas network access, the database user's least-privilege role, and that `MONGODB_URI` selects `ai_mystery_room`.
- Frontend API requests return `404`: ensure `VITE_API_BASE_URL` ends in `/api` exactly once.
- Browser requests fail CORS: set `CLIENT_URL` to the exact Vercel origin(s), without a path, then redeploy Render.
- Nested Vercel routes return a hosting 404: confirm `client/vercel.json` rewrites to `/index.html` and the Output Directory is `dist`.
- Mystery generation returns a safe service error: verify `AI_PROVIDER`, the selected provider's Render key, model ID, provider access, and usage limits in that provider's dashboard; never troubleshoot by printing the key or raw provider response.

### Local versus production settings

For local development, use `server/.env` for the local MongoDB URI, `AI_PROVIDER`, the selected provider key/model, and `CLIENT_URL=http://localhost:5173`; use `client/.env` for `VITE_API_BASE_URL=http://localhost:5000/api`. These local files are ignored by Git. For production, set provider variables only in Render and only `VITE_API_BASE_URL` in Vercel. Keep the example files as placeholders and never commit production values. OpenAI API usage is billed separately from ChatGPT subscriptions.

The app is anonymous: a case ID is a shareable session identifier, not authentication or an ownership check. Do not store personal or confidential information in a premise. The current project has not been pushed to GitHub, and no Atlas, Render, Vercel, or live Gemini configuration has been verified.

The game does not provide accounts or ownership checks. Anyone with a case ID can access that game session; do not store personal or confidential information in a premise.
