# AI Mystery Room — Implementation-Ready Technical Specification

**Document status:** Implementation source of truth  
**Project type:** Full-stack, AI-powered detective mystery game  
**Primary developer environment:** Visual Studio Code with OpenAI Codex  
**Target deployment:** Vercel (frontend) + Render (backend) + MongoDB Atlas (database)

---

## 0. Instructions for the Coding Agent

Treat this file as the acceptance contract for implementation.

1. Inspect the existing repository before editing anything. Preserve working code and adapt to the current structure where reasonable; do not recreate the project blindly.
2. Implement the project in the phases listed in Section 12. Complete and verify one phase before moving to the next.
3. Do not replace real Gemini, database, or API behavior with hard-coded demo responses in the final application. Mocks are permitted only in automated tests and clearly labelled development fixtures.
4. Do not claim a feature is complete until it has been exercised or covered by a test. Report commands run, failures, and any remaining deployment steps honestly.
5. Keep secrets on the server. Never expose `GEMINI_API_KEY`, the solution, hidden clue descriptions, or locked hint text in frontend code, browser storage, HTML, or active-case API responses.
6. Keep the implementation understandable for a student developer. Prefer a small, cohesive implementation over unnecessary abstractions, authentication systems, leaderboards, or unrelated features.
7. If a requirement conflicts with existing repository code, inspect the surrounding code and choose the smallest safe change that satisfies this specification. Update this file only when an actual product decision changes.

## A. Product Requirements

### A1. Overview

AI Mystery Room lets a player provide a short premise and choose a difficulty. Gemini generates a detective mystery with a story, suspects, alibis, clues, progressive hints, and a hidden solution. The player investigates, optionally spends points on hints, accuses one suspect, and receives a verdict with an explanation and score breakdown.

### A2. Goals

- Deliver a complete, playable end-to-end mystery-solving flow.
- Generate fresh mysteries for Easy, Medium, and Hard difficulty.
- Keep the culprit, solution explanation, undiscovered clue descriptions, and locked hint text on the backend until they are allowed to be revealed.
- Validate untrusted user input and AI output before persisting or using it.
- Calculate scores on the backend only.
- Provide a polished, responsive, accessible detective-case-file interface.
- Deploy and verify the complete workflow on the production URLs.

### A3. Users and Session Model

- Intended users: casual players, mystery/puzzle fans, and evaluators.
- MVP does not require accounts, profiles, or a leaderboard.
- A generated case is an anonymous, shareable-by-ID game session. Do not claim that MongoDB ObjectIds provide authentication or personal privacy. Do not collect personal data.
- A player may resume a case by opening its case URL while the case remains available in the database.

### A4. Scope

**Required MVP:**
- Home screen and instructions.
- Premise input and three difficulty choices.
- Gemini mystery generation with validation.
- Investigation room with suspect cards, locked/discovered clues, hints, and progress.
- Final accusation and results screen.
- Backend-authoritative score calculation.
- Responsive layout, loading/error states, tests, and deployment documentation.

**Optional, only after the MVP passes:**
- Detective's notepad saved in `localStorage` under the case ID.
- Quick-fill premise chips.
- Small score-breakdown animation or subtle case-file transitions.

**Out of scope for MVP:**
- User accounts, social features, public leaderboards, payments, multiplayer, and a user-generated case marketplace.

## B. Required Technology Stack

- **Frontend:** React 18+, Vite, JavaScript ES modules, Tailwind CSS, React Router DOM, Axios.
- **Backend:** Node.js, Express, MongoDB, Mongoose, `@google/genai`, Zod, CORS, dotenv.
- **Recommended protection/testing packages:** `express-rate-limit`; a test runner and HTTP test client such as Vitest and Supertest.
- **Database hosting:** MongoDB Atlas.
- **Backend hosting:** Render Web Service.
- **Frontend hosting:** Vercel.
- **AI model:** Read the model name from `GEMINI_MODEL`. The selected deployment model is `gemini-3.8-flash`; confirm its availability for the configured API key before deployment. Google's current model documentation lists it as stable and supporting structured outputs (checked 30 October 2026).

Do not put the Gemini API key in any `VITE_*` variable. Frontend environment variables are public after bundling.

## C. Repository Structure

Use this structure unless the existing repository already has a clean equivalent:

```text
ai-mystery-room/
├── SPEC.md
├── README.md
├── .gitignore
├── client/
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/caseApi.js
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── SuspectCard.jsx
│       │   ├── ClueCard.jsx
│       │   ├── HintPanel.jsx
│       │   ├── LoadingSpinner.jsx
│       │   └── ErrorBanner.jsx
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── CreateMystery.jsx
│       │   ├── InvestigationRoom.jsx
│       │   ├── Accusation.jsx
│       │   └── Results.jsx
│       └── styles/index.css
└── server/
    ├── .env.example
    ├── package.json
    ├── index.js
    ├── config/db.js
    ├── models/Case.js
    ├── routes/caseRoutes.js
    ├── controllers/caseController.js
    ├── services/geminiService.js
    ├── middleware/errorHandler.js
    ├── middleware/rateLimiter.js
    └── utils/
        ├── validators.js
        ├── sanitizer.js
        └── scoring.js
```

Use a consistent module format within each package. If `package.json` uses ES modules, configure it explicitly with `"type": "module"` and ensure imports match.

## D. Business Rules

### D1. Difficulty and Content Counts

| Difficulty | Suspects | Clues | Hints | Base points for a correct accusation |
|---|---:|---:|---:|---:|
| Easy | 3 | 5 | 2 | 100 |
| Medium | 4 | 7 | 3 | 150 |
| Hard | 5 | 9 | 3 | 200 |

These counts are exact, not minimums. IDs must be unique within their collection: suspects `S1...`, clues `C1...`, hints `H1...`.

### D2. Scoring

```text
basePoints = correctAccusation ? pointsForDifficulty : 0
clueBonus = numberOfDiscoveredClues * 5
hintPenalty = numberOfUnlockedHints * 10
finalScore = max(0, basePoints + clueBonus - hintPenalty)
```

A wrong accusation earns no base points, but discovered-clue bonus is still included, less the hint penalty. This follows the scoring formula above and must be implemented consistently. The frontend may show an estimated score during play, but the server's persisted score is authoritative.

### D3. Game State

A case has only two persisted states:
- `active`: clue discovery, hint requests, and one accusation are allowed.
- `completed`: the accusation is final; all gameplay mutations are rejected.

No endpoint may move a case from `completed` back to `active`. Repeated clue discovery must be idempotent and must never count the same clue twice. The backend always calculates score from persisted discovery/unlock state, never from counts supplied by the browser.

## E. User Flow and Routes

1. **Home (`/`)**: introduce the game, show the three steps and scoring rules, and provide a primary call to action.
2. **Create Mystery (`/create`)**: accept a premise and difficulty. Validate premise length from 10 to 300 characters after trimming. Submit to the backend.
3. **Generate**: the backend validates input, asks Gemini for structured content, validates the result, persists the case with all clues undiscovered and all hints locked, and returns a case ID plus safe summary fields.
4. **Investigation (`/cases/:id`)**: display story, suspects, clues, hint controls, and progress. Only clue titles/locations and locked states are visible until a clue is discovered. Do not reveal the solution.
5. **Accusation (`/cases/:id/accuse`)**: show the suspects and warn that submission ends the investigation. The player must select exactly one valid suspect.
6. **Results (`/cases/:id/result`)**: show whether the accusation was correct, the player's accusation, the true culprit, the explanation, and backend-computed score breakdown.
7. **Replay**: return to `/create` to start a separate case.

### Navigation guards

- If a completed case is opened at `/cases/:id` or `/cases/:id/accuse`, redirect to `/cases/:id/result`.
- If an active case is opened at `/cases/:id/result`, redirect to `/cases/:id` and show a brief explanation.
- Invalid IDs or missing cases show a useful not-found state, not a blank page.
- Route guards are a user-experience feature, not a security boundary. The server must enforce all state and disclosure rules independently.

## F. UI and Experience Requirements

### F1. Visual direction

Create an original, polished **detective case-file** aesthetic: dark charcoal/navy surfaces, restrained accent colors, clear typography, subtle evidence-board details, readable cards, and deliberate spacing. Avoid cloning another product's exact design. Use decorative elements only when they do not reduce readability or performance.

### F2. Screen requirements

| Screen | Required elements |
|---|---|
| Home | Project name, concise explanation, “How it works” steps, scoring summary, “Create a Mystery” CTA. |
| Create Mystery | Premise textarea, 10–300 character counter, inline validation, quick-fill chips (optional), three difficulty cards showing counts/base points, loading state, generate button. |
| Investigation | Case title and difficulty, story briefing, progress summary, suspects grid, clue grid, hint panel, current estimated score, and final-accusation CTA. |
| Accusation | Clear end-of-investigation warning, accessible single-choice suspect cards, cancel/back link, submit button, disabled/loading state. |
| Results | Correct/incorrect verdict, player's suspect versus true culprit, final score and itemized formula, explanation grounded in named clues, play-again CTA. |

### F3. Responsive and accessibility requirements

- Mobile (<640px): one-column layout, full-width action buttons, no horizontal page overflow.
- Tablet (640–1024px): two-column cards where space allows.
- Desktop (>1024px): three-column suspect/clue cards when content fits, with hints placed beside or below the investigation content.
- Use semantic headings, actual buttons for actions, labels for controls, visible keyboard focus, sufficient text contrast, and meaningful accessible names.
- Never communicate correctness by color alone. Respect reduced-motion preferences for nonessential animations.

### F4. Loading and failure states

- Generation: loading indicator with short rotating case-themed messages; disable duplicate submissions.
- Case fetch: skeleton/loading state.
- Clue/hint mutation: disable only the affected action while that request is in flight and prevent duplicate in-flight requests.
- Recoverable API/AI failure: human-readable message and retry action where retry is safe.
- 404 case: explain that the case could not be found and provide a Home link.
- Network failure: explain that the server could not be reached without showing stack traces or secrets.

## G. Database Design

### G1. `Case` document

Use Mongoose with timestamps. Embed the small, fixed-size suspect, clue, and hint arrays in each case document.

```text
Case
- title: required string
- premise: required string
- story: required string
- difficulty: Easy | Medium | Hard
- status: active | completed (default active)
- suspects: [{ suspectId, name, role, personality, motive, alibi }]
- clues: [{ clueId, title, location, description, discovered }]
- hints: [{ hintId, text, unlocked }]
- solution: { culpritId, supportingClueIds, explanation }
- accusation: { suspectId, isCorrect, submittedAt }
- scoreBreakdown: { basePoints, clueBonus, hintPenalty, total }
- createdAt, updatedAt
```

Use required-field validation. Disable embedded `_id` fields where custom IDs are used and embedded Mongo IDs are not needed. Add an enum validator for `difficulty` and `status`. Ensure `supportingClueIds` contains at least two unique IDs that exist in the generated clues.

### G2. Initial state on save

- All clues start with `discovered: false`.
- All hints start with `unlocked: false`.
- `status` starts as `active`.
- `accusation` fields and score breakdown start unset/null or at documented zero defaults.
- Never accept those state values from Gemini as authoritative; the backend initializes them.

### G3. Data disclosure rules

Create explicit response DTOs/sanitizers rather than returning a Mongoose document directly.

For an active case response:
- Exclude the entire `solution` object.
- Exclude `accusation` and final score details.
- For an undiscovered clue, return only `{ clueId, title, location, discovered: false }`; omit `description` entirely.
- For a discovered clue, return `{ clueId, title, location, description, discovered: true }`.
- For a locked hint, return only `{ hintId, unlocked: false }`; omit `text` entirely.
- For an unlocked hint, return `{ hintId, text, unlocked: true }`.
- Do not expose API keys, internal prompt text, provider errors, or stack traces.

The results endpoint may reveal the solution only after the case has reached `completed`.

## H. Gemini Generation Contract

### H1. Input

The server sends Gemini:
- A fixed system/developer instruction defining the output contract and mystery-writing rules.
- The trimmed premise as untrusted story input, clearly delimited as data rather than instructions.
- The selected difficulty and exact required counts.
- A request for JSON matching the defined schema.

Do not let instructions embedded inside a user premise override the generation contract. Set a reasonable request timeout. Do not log API keys or full sensitive environment values.

### H2. Required model output

The AI-generated content must contain these fields (the backend adds gameplay state):

```json
{
  "title": "The Clockwork Gallery",
  "story": "Two or three concise paragraphs describing the setting, crime, and circumstances.",
  "suspects": [
    {
      "suspectId": "S1",
      "name": "String",
      "role": "String",
      "personality": "String",
      "motive": "String",
      "alibi": "String"
    }
  ],
  "clues": [
    {
      "clueId": "C1",
      "title": "String",
      "location": "String",
      "description": "String"
    }
  ],
  "hints": [
    { "hintId": "H1", "text": "String" }
  ],
  "solution": {
    "culpritId": "S1",
    "supportingClueIds": ["C1", "C3"],
    "explanation": "String explaining how the evidence establishes guilt and addresses the alibi."
  }
}
```

The example is illustrative; the number of array items must match the selected difficulty table. The backend initializes `discovered`, `unlocked`, `status`, accusation, and score fields.

### H3. Mystery quality rules

The model prompt must require:
- Exactly one culprit, represented by a valid `suspectId`.
- A fair, solvable mystery whose solution is supported by at least two identified clues.
- At least two unique supporting clue IDs, all present in `clues`.
- Evidence that connects to concrete facts in the story/suspect alibis; avoid an explanation that depends on a fact never mentioned by the story or clues.
- Distinct suspects with plausible motives and alibis. Motive alone must not be treated as proof.
- No contradiction that makes more than one suspect equally guilty, and no requirement for outside knowledge.
- Progressive hints that guide reasoning without immediately naming the culprit.
- Safe, fictional content. Do not generate instructions for real-world wrongdoing or graphic violence.

Zod can prove the shape and some cross-field relationships; it cannot prove narrative logic. Use the quality rules in the prompt and deterministic checks where possible, but do not claim perfect logical consistency is guaranteed by schema validation alone.

### H4. Validation and bounded retry

Before inserting a generated case, validate:
1. All required strings exist, are strings, and are non-empty after trimming.
2. The arrays have exact counts for the selected difficulty.
3. IDs match the required pattern and are unique within each array.
4. `solution.culpritId` matches an existing suspect ID.
5. `solution.supportingClueIds` contains at least two unique IDs, each present in the clues array.
6. No required item is missing or duplicated.
7. Reasonable maximum lengths are enforced for titles, story, names, alibis, clue descriptions, hints, and explanation to prevent oversized payloads.

If parsing or validation fails, retry generation at most once with a concise correction instruction. Do not retry indefinitely. If the retry fails, return a safe `502` response and do not save a partial/invalid case. Handle provider rate limits, timeouts, and outages gracefully.

## I. Backend API Contract

Use `/api` as the API prefix. All errors must use a consistent shape:

```json
{ "error": { "code": "INVALID_INPUT", "message": "A user-safe explanation." } }
```

Do not expose stack traces, raw provider responses, database connection strings, or internal prompts in error responses.

### I1. `GET /api/health`

- Purpose: deployment health check.
- `200`: `{ "status": "ok" }` when the process is healthy; report database readiness separately or return an appropriate non-200 status if the service cannot serve requests.

### I2. `POST /api/cases` — Generate

Request:

```json
{ "premise": "A valuable painting vanishes during a private exhibition.", "difficulty": "Medium" }
```

Rules:
- Trim premise and enforce 10–300 characters.
- Accept only `Easy`, `Medium`, or `Hard`.
- Apply a generation rate limit.
- Validate Gemini output fully before persisting.

Success (`201`):

```json
{ "caseId": "<id>", "title": "The Missing Masterpiece", "difficulty": "Medium" }
```

Expected errors: `400` invalid input, `429` rate limit, `502` generation/validation failure, `503` service temporarily unavailable where appropriate.

### I3. `GET /api/cases/:id` — Retrieve active-game view

- Validate the MongoDB ID before querying.
- Return the sanitized case DTO described in Section G3.
- Return the current status so the UI can route a completed case to results.
- Do not include the solution, final explanation, accusation, or score breakdown.

Expected errors: `400` malformed ID, `404` case not found, `500` generic internal error.

### I4. `POST /api/cases/:id/clues/:clueId/discover`

- Validate case ID and clue ID.
- Reject gameplay mutation if the case is completed.
- Mark the requested clue discovered. Discovering the same clue repeatedly must be idempotent and must not increase the count more than once.
- Return the clue description only after the backend has marked that clue discovered.

Success (`200`):

```json
{
  "clue": { "clueId": "C1", "title": "A Torn Ticket", "location": "Gallery", "description": "...", "discovered": true },
  "discoveredCluesCount": 1
}
```

Expected errors: `400` completed case or invalid action, `404` case/clue not found.

### I5. `POST /api/cases/:id/hints`

- Validate case ID and require an active case.
- Unlock the next locked hint in deterministic order (`H1`, then `H2`, etc.).
- If no hint remains, return `400` with code `NO_HINTS_REMAINING`.
- Do not allow concurrent or repeated UI clicks to consume multiple hints accidentally. The frontend must disable the request while pending; the backend remains authoritative.

Success (`200`):

```json
{
  "hint": { "hintId": "H1", "text": "Compare the exhibition log with the caretaker's stated timeline.", "unlocked": true },
  "unlockedHintsCount": 1,
  "remainingHints": 1
}
```

Expected errors: `400` completed case or no hints remaining, `404` case not found.

### I6. `POST /api/cases/:id/accuse`

Request:

```json
{ "suspectId": "S2" }
```

Rules:
- Require a valid existing suspect ID and an active case.
- Allow at most one successful accusation. The server must reject subsequent accusations after completion.
- Calculate `isCorrect` and all score fields from current persisted case state.
- Persist accusation, completion status, and score breakdown consistently. Guard the status transition so two simultaneous requests cannot both complete the same active case.

Success (`200`):

```json
{
  "caseId": "<id>",
  "status": "completed",
  "isCorrect": true,
  "scoreBreakdown": { "basePoints": 150, "clueBonus": 15, "hintPenalty": 10, "total": 155 }
}
```

Expected errors: `400` invalid suspect or already completed, `404` case not found. Do not return the true culprit or explanation in this response unless the API contract explicitly changes; the results endpoint is the canonical reveal.

### I7. `GET /api/cases/:id/result`

- Return `403` with code `CASE_NOT_COMPLETED` if the case is still active.
- Return `404` if the case does not exist.
- Only after completion, return the result DTO containing the player's accusation, correctness, true culprit, supporting clue references, explanation, and score breakdown.
- Never rely on frontend route guards to protect this data.

## J. Security, Reliability, and Operational Requirements

- Keep `GEMINI_API_KEY` and `MONGODB_URI` in server environment variables only.
- Commit `.env.example` files with placeholders, never real credentials.
- Ensure `.env`, local secrets, build artifacts, and logs containing secrets are in `.gitignore`.
- Configure CORS to allow the expected local development origin and configured production frontend origin only.
- Apply rate limiting to expensive generation endpoints; choose a reasonable initial limit and document it. Avoid rate-limiting health checks.
- Enforce JSON request-size limits and validate all user-controlled path/body values.
- Never build MongoDB queries directly from arbitrary user-supplied objects.
- Use fixed, server-owned scoring constants; ignore any client-supplied score/count values.
- Use an explicit sanitizer/DTO on every active-case and result response. Avoid serializing complete Mongoose documents by default.
- Handle database disconnection and Gemini failures without crashing the server.
- Use bounded timeouts and one bounded generation retry, not infinite retry loops.
- Keep server logs useful but sanitized. Do not log API keys or unnecessary premise/story content.
- Protect state transitions against duplicate clue discovery, accidental duplicate hint requests, and concurrent accusations.
- The anonymous MVP does not provide strong ownership/privacy for a case ID. State this limitation in the README rather than claiming authentication.

## K. Environment Variables

### Server `.env.example`

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb_connection_string_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
CLIENT_URL=http://localhost:5173
```

`GEMINI_MODEL` is configurable; verify the selected model is currently available to the configured key. Do not put the server key in the client environment.

### Client `.env.example`

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Production values must be configured in the hosting provider dashboards. Do not commit production values.

## L. Testing and Acceptance Criteria

### L1. Automated tests

Add tests for pure business logic and API behavior. Mock Gemini in tests so routine tests do not require a live API key or incur API charges.

At minimum, test:
- Each difficulty maps to its exact suspect/clue/hint counts and base score.
- Valid generated output passes validation; wrong counts, duplicate IDs, an invalid culprit ID, or invalid supporting clue IDs fail validation.
- Active-case sanitizer excludes solution fields, final score, undiscovered descriptions, and locked hint text.
- Discovered clues and unlocked hints return their descriptions/text.
- Clue discovery is idempotent.
- Hints unlock in order and cannot exceed the difficulty limit.
- Scoring is correct for right/wrong accusations, clue bonuses, hint penalties, and the zero floor.
- Result endpoint rejects an active case with `403`.
- Completed cases reject further gameplay mutations and accusations.
- Invalid request data and malformed IDs receive appropriate status codes.

### L2. Manual end-to-end checks

Before submission, complete each flow on a deployed production URL:
1. Generate an Easy mystery, discover a clue, request a hint, accuse, and inspect results.
2. Repeat for Medium and Hard to verify exact counts.
3. Refresh the investigation page and verify progress persists.
4. Attempt to open the results URL before accusation and verify the server denies it.
5. Inspect browser Network responses during active gameplay: no `solution`, no solution explanation, no undiscovered clue description, no locked hint text, and no final score breakdown.
6. Try invalid premise lengths, invalid difficulty, invalid case ID, repeated clue click, too many hint requests, and a second accusation.
7. Test phone-width and desktop-width layouts.
8. Verify that the deployed frontend communicates with the deployed backend and database.

### L3. Definition of done

- [ ] App follows the required stack and repository conventions.
- [ ] `SPEC.md` is committed at repository root.
- [ ] All difficulty levels generate the exact configured counts.
- [ ] All required gameplay screens and actions work.
- [ ] Solution and hidden evidence are not exposed during active gameplay.
- [ ] Backend owns validation, state transitions, and score calculation.
- [ ] Results show verdict, true culprit, evidence-based explanation, and score breakdown.
- [ ] Loading, empty, validation, not-found, and server-error states are handled.
- [ ] Automated tests pass and the manual production checklist is complete.
- [ ] `README.md` documents setup, scripts, environment variables, architecture, tests, and deployment.
- [ ] Public GitHub repository and live website URL are ready for submission.

## M. Deployment and README

### M1. Deployment order

1. Create MongoDB Atlas database and configure a least-privilege database user/network access appropriate for the host.
2. Deploy `server/` as a Render Web Service. Configure server environment variables and verify `GET /api/health`.
3. Deploy `client/` to Vercel. Set `VITE_API_BASE_URL` to the production backend API URL and configure SPA routing so nested React routes load directly.
4. Set the backend's `CLIENT_URL` to the deployed frontend origin; redeploy if the value changes.
5. Complete the production checks in Section L2. Do not submit just because the homepage loads.

### M2. README must include

- Project summary and feature list.
- Screenshots or a short demo GIF/video if available.
- Tech stack and simple architecture description.
- Prerequisites and local setup instructions for both `client` and `server`.
- Environment-variable table with example values/placeholders only.
- Commands for development, testing, and production build.
- API endpoint summary.
- Deployment links and known limitations.
- A note that the game is anonymous and that a case ID is not an authentication mechanism.

## N. Codex Implementation Plan

Use this order; do not attempt to implement everything in one unreviewed code-generation pass.

### Phase 1 — Repository and configuration
- Inspect repository and report existing structure.
- Set up/verify client and server package scripts, module format, `.gitignore`, and `.env.example`.
- Confirm the app starts locally before adding features.

### Phase 2 — Backend foundation
- Connect Express to MongoDB.
- Add the Mongoose model, health endpoint, consistent error middleware, request validation, and CORS.
- Verify database connection and health check.

### Phase 3 — AI and domain logic
- Implement Gemini service, output schema, cross-field validation, bounded retry, sanitizer, and scoring helper.
- Add pure-function tests for validation, sanitizer, and scoring before connecting the UI.

### Phase 4 — API
- Implement generation, retrieval, clue discovery, hint request, accusation, and result endpoints.
- Test status codes, state transitions, and data disclosure with mocked AI/test cases.

### Phase 5 — Frontend
- Build all five screens and shared components.
- Connect using one API module and use the backend as the source of truth.
- Handle loading, validation, empty, error, and route-guard states.
- Verify mobile responsiveness and keyboard accessibility.

### Phase 6 — Final quality checks
- Run lint/build/tests and fix errors.
- Manually verify all difficulty levels and security acceptance checks.
- Deploy backend, then frontend; verify environment variables, CORS, direct nested-route refreshes, and database persistence.
- Update README with verified results only. Summarize what was tested and disclose any incomplete items.

---

**Final submission deliverables:** the public GitHub repository containing the complete source code, the live deployed frontend URL, and a successful mystery-solving run completed on the live website.
