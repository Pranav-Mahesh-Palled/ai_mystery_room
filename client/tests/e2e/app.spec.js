import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const CASE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const COUNTS = {
  Easy: { suspects: 3, clues: 5, hints: 2, basePoints: 100 },
  Medium: { suspects: 4, clues: 7, hints: 3, basePoints: 150 },
  Hard: { suspects: 5, clues: 9, hints: 3, basePoints: 200 },
};
const ARTIFACTS = path.resolve('test-artifacts/screenshots');
const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? [], 'browser JavaScript runtime errors').toEqual([]);
});

function makeMockState() {
  const state = {
    difficulty: 'Easy',
    premise: 'A silver pocket watch disappears during a quiet museum evening.',
    complete: false,
    accusedId: null,
    createRequests: [],
    accusationRequests: [],
    hintRequests: [],
    hintByKey: new Map(),
    failGenerationOnce: false,
    failDiscoveryOnce: false,
    dropHintResponseOnce: false,
    droppedHintResponse: false,
    dropAccusationResponseOnce: false,
    droppedAccusationResponse: false,
    delayHintMs: 0,
    delayGenerationMs: 0,
    clues: [],
    hints: [],
  };

  state.reset = (difficulty = 'Easy') => {
    state.difficulty = difficulty;
    state.complete = false;
    state.accusedId = null;
    state.clues = Array.from({ length: COUNTS[difficulty].clues }, (_, index) => ({
      clueId: `C${index + 1}`,
      title: `Evidence item ${index + 1}`,
      location: `Gallery room ${index + 1}`,
      description: `Hidden clue description ${index + 1}.`,
      discovered: false,
    }));
    state.hints = Array.from({ length: COUNTS[difficulty].hints }, (_, index) => ({
      hintId: `H${index + 1}`,
      text: `Hidden hint text ${index + 1}.`,
      unlocked: false,
      requestKey: null,
    }));
  };
  state.reset();
  return state;
}

function activeDto(state) {
  return {
    caseId: CASE_ID,
    title: 'The Glasshouse Ledger',
    premise: state.premise,
    story: 'A pocket watch vanished during a private museum evening. Five guests crossed the gallery before the doors were secured.\n\nA misplaced ledger entry may reveal who had time to reach the display.',
    difficulty: state.difficulty,
    status: state.complete ? 'completed' : 'active',
    suspects: Array.from({ length: COUNTS[state.difficulty].suspects }, (_, index) => ({
      suspectId: `S${index + 1}`,
      name: ['Mara Vale', 'Jonas Reed', 'Iris Bell', 'Theo Marsh', 'Nina Cross'][index],
      role: ['Curator', 'Restorer', 'Archivist', 'Guard', 'Guest'][index],
      personality: 'Careful and observant.',
      motive: 'A private debt made the watch tempting.',
      alibi: `Claims to have been in the east room at ${8 + index}:10.`,
    })),
    clues: state.clues.map(({ clueId, title, location, description, discovered }) => (
      discovered ? { clueId, title, location, description, discovered: true } : { clueId, title, location, discovered: false }
    )),
    hints: state.hints.map(({ hintId, text, unlocked }) => (
      unlocked ? { hintId, text, unlocked: true } : { hintId, unlocked: false }
    )),
  };
}

function resultDto(state) {
  const correct = state.accusedId === 'S1';
  const counts = COUNTS[state.difficulty];
  const clueBonus = state.clues.filter((clue) => clue.discovered).length * 5;
  const hintPenalty = state.hints.filter((hint) => hint.unlocked).length * 10;
  const scoreBreakdown = {
    basePoints: correct ? counts.basePoints : 0,
    clueBonus,
    hintPenalty,
    total: Math.max(0, (correct ? counts.basePoints : 0) + clueBonus - hintPenalty),
  };
  return {
    caseId: CASE_ID,
    title: 'The Glasshouse Ledger',
    difficulty: state.difficulty,
    accusation: {
      suspectId: state.accusedId,
      suspect: { suspectId: state.accusedId, name: state.accusedId === 'S1' ? 'Mara Vale' : 'Jonas Reed', role: 'Curator' },
    },
    isCorrect: correct,
    trueCulprit: { suspectId: 'S1', name: 'Mara Vale', role: 'Curator', motive: 'The watch would settle an old debt.', alibi: 'The ledger places Mara in the gallery at the missing time.' },
    solution: {
      explanation: 'The ledger and the displaced display pin place Mara beside the case during the theft.',
      supportingClues: state.clues.slice(0, 2).map(({ clueId, title, location, description }) => ({ clueId, title, location, description })),
    },
    finalScore: scoreBreakdown.total,
    scoreBreakdown,
  };
}

async function installApiMock(page, options = {}) {
  const state = makeMockState();
  Object.assign(state, options);
  await page.route(/\/api\/cases(?:\/|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (pathname === '/api/cases' && request.method() === 'POST') {
      const payload = request.postDataJSON();
      state.createRequests.push(payload);
      if (state.failGenerationOnce) {
        state.failGenerationOnce = false;
        return json({ error: { code: 'MYSTERY_GENERATION_FAILED', message: 'The mystery could not be generated. Please try again.' } }, 502);
      }
      state.premise = payload.premise;
      state.reset(payload.difficulty);
      if (state.delayGenerationMs) await new Promise((resolve) => setTimeout(resolve, state.delayGenerationMs));
      return json({ caseId: CASE_ID, title: 'The Glasshouse Ledger', difficulty: payload.difficulty }, 201);
    }

    if (pathname === `/api/cases/${CASE_ID}/result` && request.method() === 'GET') {
      if (!state.complete) return json({ error: { code: 'CASE_NOT_COMPLETED', message: 'Submit an accusation first.' } }, 403);
      return json(resultDto(state));
    }

    if (pathname === `/api/cases/${CASE_ID}` && request.method() === 'GET') return json(activeDto(state));

    const clueMatch = pathname.match(new RegExp(`/api/cases/${CASE_ID}/clues/(C\\d+)/discover$`));
    if (clueMatch && request.method() === 'POST') {
      const clue = state.clues.find((item) => item.clueId === clueMatch[1]);
      if (state.failDiscoveryOnce) {
        state.failDiscoveryOnce = false;
        return json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Temporarily unavailable.' } }, 503);
      }
      if (!clue) return json({ error: { code: 'CLUE_NOT_FOUND', message: 'Clue missing.' } }, 404);
      clue.discovered = true;
      return json({ clue: { ...clue }, discoveredCluesCount: state.clues.filter((item) => item.discovered).length });
    }

    if (pathname === `/api/cases/${CASE_ID}/hints` && request.method() === 'POST') {
      const key = request.headers()['idempotency-key'];
      state.hintRequests.push(key);
      let hint = key ? state.hintByKey.get(key) : null;
      if (!hint) {
        hint = state.hints.find((item) => !item.unlocked);
        if (!hint) return json({ error: { code: 'NO_HINTS_REMAINING', message: 'No hints remain.' } }, 400);
        hint.unlocked = true;
        hint.requestKey = key ?? null;
        if (key) state.hintByKey.set(key, hint);
      }
      const response = {
        hint: { hintId: hint.hintId, text: hint.text, unlocked: true },
        unlockedHintsCount: state.hints.filter((item) => item.unlocked).length,
        remainingHints: state.hints.filter((item) => !item.unlocked).length,
      };
      if (state.delayHintMs) await new Promise((resolve) => setTimeout(resolve, state.delayHintMs));
      if (state.dropHintResponseOnce && !state.droppedHintResponse) {
        state.droppedHintResponse = true;
        await route.abort('failed');
        return;
      }
      return json(response);
    }

    if (pathname === `/api/cases/${CASE_ID}/accuse` && request.method() === 'POST') {
      const payload = request.postDataJSON();
      state.accusationRequests.push(payload);
      state.accusedId = payload.suspectId;
      state.complete = true;
      if (state.dropAccusationResponseOnce && !state.droppedAccusationResponse) {
        state.droppedAccusationResponse = true;
        await route.abort('failed');
        return;
      }
      return json({ caseId: CASE_ID, status: 'completed', isCorrect: payload.suspectId === 'S1', scoreBreakdown: resultDto(state).scoreBreakdown });
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unmocked API request.' } }, 404);
  });
  return state;
}

async function createCase(page, difficulty = 'Easy') {
  await page.goto('/create');
  await page.getByLabel('Describe the incident').fill('A pocket watch disappears from a museum display.');
  await page.getByRole('radio', { name: new RegExp(difficulty) }).check();
  await page.getByRole('button', { name: /Generate mystery/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}$`));
}

test('home navigation and premise validation work without browser runtime errors', async ({ page }) => {
  await installApiMock(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Every detail/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From first clue to final call.' })).toBeVisible();
  await page.getByRole('link', { name: 'Start an investigation' }).click();
  await expect(page).toHaveURL(/\/create$/);
  const premise = page.getByLabel('Describe the incident');
  await premise.fill('short');
  await premise.blur();
  await expect(page.getByText('Write a premise between 10 and 300 characters.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate mystery/ })).toBeDisabled();
});

test('mobile navigation opens, routes, and closes after selection', async ({ page }) => {
  await installApiMock(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  await menu.click();
  const openMenu = page.getByRole('button', { name: 'Close navigation menu' });
  await expect(openMenu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'New investigation' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false');
});

for (const difficulty of Object.keys(COUNTS)) {
  test(`create and render exact ${difficulty} case counts`, async ({ page }) => {
    const mock = await installApiMock(page);
    await createCase(page, difficulty);
    expect(mock.createRequests).toEqual([{ premise: 'A pocket watch disappears from a museum display.', difficulty }]);
    await expect(page.getByRole('heading', { name: 'The Glasshouse Ledger' })).toBeVisible();
    await expect(page.locator('.suspect-card')).toHaveCount(COUNTS[difficulty].suspects);
    await expect(page.locator('.clue-card')).toHaveCount(COUNTS[difficulty].clues);
    await expect(page.locator('.hint-count')).toHaveText(`${COUNTS[difficulty].hints} remaining`);
    await expect(page.getByText('Hidden clue description 1.')).toHaveCount(0);
    await expect(page.getByText('Hidden hint text 1.')).toHaveCount(0);
  });
}

test('generation failure remains visible and allows a safe retry', async ({ page }) => {
  const mock = await installApiMock(page, { failGenerationOnce: true });
  await page.goto('/create');
  await page.getByLabel('Describe the incident').fill('A pocket watch disappears from a museum display.');
  await page.getByRole('button', { name: /Generate mystery/ }).click();
  await expect(page.getByText('The mystery could not be assembled this time. Your premise is still here; please try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate mystery/ })).toBeEnabled();
  await page.getByRole('button', { name: /Generate mystery/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}$`));
  expect(mock.createRequests).toHaveLength(2);
});

test('generation loading state disables duplicate submissions', async ({ page }) => {
  const mock = await installApiMock(page, { delayGenerationMs: 250 });
  await page.goto('/create');
  await page.getByLabel('Describe the incident').fill('A pocket watch disappears from a museum display.');
  const generate = page.locator('.generate-button');
  await generate.click();
  await expect(page.getByText('Setting the scene…')).toBeVisible();
  await expect(generate).toBeDisabled();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}$`));
  expect(mock.createRequests).toHaveLength(1);
});

test('clue failure stays locked; successful discovery reveals evidence and survives refresh', async ({ page }) => {
  const mock = await installApiMock(page, { failDiscoveryOnce: true });
  await page.goto(`/cases/${CASE_ID}`);
  await expect(page.getByRole('heading', { name: 'The Glasshouse Ledger' })).toBeVisible();
  const clue = page.locator('.clue-card').first();
  await clue.getByRole('button', { name: 'Examine evidence' }).click();
  await expect(page.getByText('The case room is temporarily unavailable. Your information is still here; please try again shortly.')).toBeVisible();
  await expect(page.getByText('Hidden clue description 1.')).toHaveCount(0);
  await clue.getByRole('button', { name: 'Examine evidence' }).click();
  await expect(page.getByText('Hidden clue description 1.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Hidden clue description 1.')).toBeVisible();
  await expect(page.locator('.clue-card').first().getByText('Examined')).toBeVisible();
  const stored = await page.evaluate(() => `${localStorage.length}:${sessionStorage.length}`);
  expect(stored).toBe('0:0');
});

test('a dropped hint response retries with the same key and does not charge twice', async ({ page }) => {
  const mock = await installApiMock(page, { dropHintResponseOnce: true });
  await page.goto(`/cases/${CASE_ID}`);
  const button = page.getByRole('button', { name: /Request a hint/ });
  await button.click();
  await expect(page.getByText('The case server could not be reached. Check your connection and try again.')).toBeVisible();
  await expect(page.locator('.hint-count')).toHaveText('2 remaining');
  await expect(page.getByText('Hidden hint text 1.')).toHaveCount(0);
  await button.click();
  await expect(page.getByText('Hidden hint text 1.')).toBeVisible();
  await expect(page.locator('.hint-count')).toHaveText('1 remaining');
  expect(mock.hintRequests).toHaveLength(2);
  expect(mock.hintRequests[0]).toBeTruthy();
  expect(mock.hintRequests[0]).toBe(mock.hintRequests[1]);

  await page.getByRole('button', { name: /Request a hint/ }).click();
  await expect(page.getByText('Hidden hint text 2.')).toBeVisible();
  expect(mock.hintRequests[2]).not.toBe(mock.hintRequests[1]);
  await expect(page.locator('.hint-count')).toHaveText('0 remaining');
});

test('a rapid repeated hint click is blocked while the first request is pending', async ({ page }) => {
  const mock = await installApiMock(page, { delayHintMs: 250 });
  await page.goto(`/cases/${CASE_ID}`);
  const button = page.getByRole('button', { name: /Request a hint/ });
  await button.dblclick();
  await expect(page.getByText('Hidden hint text 1.')).toBeVisible();
  expect(mock.hintRequests).toHaveLength(1);
  await expect(page.locator('.hint-count')).toHaveText('1 remaining');
});

test('an active result URL returns to investigation without revealing the solution', async ({ page }) => {
  await installApiMock(page);
  await page.goto(`/cases/${CASE_ID}/result`);
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}$`));
  await expect(page.getByText('The reveal stays sealed until you submit your final accusation.')).toBeVisible();
  await expect(page.getByText('The explanation')).toHaveCount(0);
  await expect(page.getByText('Mara Vale')).toHaveCount(1);
});

test('accusation requires a choice, sends only the selected ID, and displays results', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto(`/cases/${CASE_ID}/accuse`);
  await expect(page.getByText('This is your final call.')).toBeVisible();
  const submit = page.getByRole('button', { name: /Submit final accusation/ });
  await expect(submit).toBeDisabled();
  const suspects = page.getByRole('radio');
  await expect(suspects).toHaveCount(3);
  await suspects.nth(1).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}/result$`));
  await expect(page.getByRole('heading', { name: 'The details led elsewhere.' })).toBeVisible();
  await expect(page.getByText('Score breakdown')).toBeVisible();
  expect(mock.accusationRequests).toEqual([{ suspectId: 'S2' }]);
  await expect(page.getByText('The ledger and the displaced display pin place Mara beside the case during the theft.')).toBeVisible();
});

test('a dropped accusation response re-fetches the completed case and opens results', async ({ page }) => {
  const mock = await installApiMock(page, { dropAccusationResponseOnce: true });
  await page.goto(`/cases/${CASE_ID}/accuse`);
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: /Submit final accusation/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}/result$`));
  await expect(page.getByRole('heading', { name: 'You read the room.' })).toBeVisible();
  expect(mock.accusationRequests).toEqual([{ suspectId: 'S1' }]);
});

test('a completed case cannot submit a second accusation from the browser', async ({ page }) => {
  const mock = await installApiMock(page);
  await page.goto(`/cases/${CASE_ID}/accuse`);
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: /Submit final accusation/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}/result$`));
  await page.goto(`/cases/${CASE_ID}/accuse`);
  await expect(page).toHaveURL(new RegExp(`/cases/${CASE_ID}/result$`));
  expect(mock.accusationRequests).toHaveLength(1);
});

test('responsive screens fit five target viewports and capture mobile/desktop screenshots', async ({ page }) => {
  const mock = await installApiMock(page);
  await mkdir(ARTIFACTS, { recursive: true });
  const screens = [
    { name: 'home', route: '/', heading: /Every detail/ },
    { name: 'create', route: '/create', heading: 'What happened?' },
    { name: 'investigation', route: `/cases/${CASE_ID}`, heading: 'The Glasshouse Ledger' },
    { name: 'accusation', route: `/cases/${CASE_ID}/accuse`, heading: 'Who did it?' },
    { name: 'results', route: `/cases/${CASE_ID}/result`, heading: 'You read the room.' },
  ];
  const viewports = [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const screen of screens) {
      mock.reset('Hard');
      if (screen.name === 'results') {
        mock.complete = true;
        mock.accusedId = 'S1';
      }
      await page.goto(screen.route);
      await expect(page.getByRole('heading', { name: screen.heading }).first()).toBeVisible();
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(layout.document, `${screen.name} overflows at ${viewport.width}px`).toBeLessThanOrEqual(layout.viewport);
      expect(layout.body, `${screen.name} body overflows at ${viewport.width}px`).toBeLessThanOrEqual(layout.viewport);
      const actionOverflow = await page.locator('button:visible, a.button:visible').evaluateAll((elements) => elements.some((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      }));
      expect(actionOverflow, `${screen.name} action extends past viewport at ${viewport.width}px`).toBe(false);

      if (viewport.width === 375 || viewport.width === 1366) {
        const suffix = viewport.width === 375 ? 'mobile-375' : 'desktop-1366';
        await page.screenshot({ path: path.join(ARTIFACTS, `${screen.name}-${suffix}.png`), fullPage: true });
      }
    }
  }
});
