import { defineConfig } from '@playwright/test';

/** Checks against real websites (needs internet; results depend on what sites serve today). */
export default defineConfig({
  testDir: 'tests/live',
  timeout: 120_000,
  workers: 1,
  retries: 1,
  reporter: [['list']],
});
