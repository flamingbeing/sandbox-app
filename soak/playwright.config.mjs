// Emulator-only runs; one worker bounds browser/Node load. All listeners use 8100-8109.
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname, '..');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8101';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:8102';
export default defineConfig({
  testDir: root,
  testMatch: ['soak/chaos.spec.mjs', 'soak/reload.spec.mjs', 'e2e/sync.spec.mjs', 'e2e/offline.spec.mjs'],
  workers: 1, fullyParallel: false, retries: 0, timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(process.env.TEMP || os.tmpdir(), process.env.SOAK_OUTPUT || 'sandbox-soak-results'),
  reporter: [['list'], ['json', { outputFile: path.join(process.env.TEMP || os.tmpdir(), `${process.env.SOAK_OUTPUT || 'sandbox-soak-results'}.json`) }]],
  globalSetup: path.join(root, 'e2e/global-setup.mjs'),
  use: { navigationTimeout: 30_000, actionTimeout: 15_000, baseURL: 'http://localhost:8100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: ['chromium', 'webkit'].map(browserName => ({ name: browserName, use: { browserName, launchOptions: browserName === 'chromium' ? { args: ['--no-zygote', '--renderer-process-limit=3', '--disable-gpu'] } : {} } })),
  webServer: [
    { command: 'node soak/emulators.mjs', cwd: root, url: 'http://127.0.0.1:8101', reuseExistingServer: true, timeout: 180_000, gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 } },
    { command: 'node soak/serve.mjs', cwd: root, url: 'http://127.0.0.1:8100/app/', reuseExistingServer: false, stdout: 'pipe', stderr: 'pipe', timeout: 30_000 },
  ],
});
