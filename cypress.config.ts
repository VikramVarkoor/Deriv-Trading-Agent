import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    // The app must be running locally with `npm run dev` before e2e tests run.
    baseUrl: 'http://localhost:3000',

    // Where test files live
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',

    // Reasonable timeouts for a Next.js app with network calls
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,

    // Keep video off for CI speed; enable locally with --headed if debugging
    video: false,
    screenshotOnRunFailure: true,
  },
});
