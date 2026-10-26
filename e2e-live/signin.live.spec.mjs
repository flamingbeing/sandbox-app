// Live sign-in smoke test (workflow "Live smoke"; not part of `npx playwright test`). Signs the test user in on the
// deployed site and checks the signed-in state: the test user has a role here (a `members/{uid}` doc, see
// docs/new-app-checklist.md step 3), so the app shows the list, not the no-access screen, and the browser logs no
// errors. The test only looks: nothing is written.
// The starter signs in with Google only, so the test user (email + password) is signed in through the API
// (app-devkit playwright/live.mjs). Run: LIVE_URL=... LIVE_SPEC=e2e-live LIVE_TEST_EMAIL=... LIVE_TEST_PASSWORD=...
//   npx playwright test -c .devkit/playwright/live.config.mjs
import { test, expect } from '@playwright/test';
import { liveUser, watchConsole, signInViaApi } from '../.devkit/playwright/live.mjs';
import { firebaseConfig } from '../app/src/config.js';

const { email, password } = liveUser();
test.skip(!email || !password || !firebaseConfig.apiKey, 'no test user, or the app has no web config yet');

test('the test user is signed in on the live site, sees the list and no console errors', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/');
  await expect(page.locator('#signed-out')).toBeVisible();
  await signInViaApi(page, { apiKey: firebaseConfig.apiKey, authDomain: firebaseConfig.authDomain, email, password });
  await page.reload();
  await expect(page.locator('#who')).toHaveText(email);
  await expect(page.locator('#signed-out')).toBeHidden();
  await expect(page.locator('#list-view')).toBeVisible();  // an account with a role sees the list
  await expect(page.locator('#no-access')).toBeHidden();
  expect(errors).toEqual([]);
});
