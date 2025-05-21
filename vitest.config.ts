import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: [
            'tests/unit/**/*.{test,spec}.{ts,tsx}',
            'tests/**/*.unit.{test,spec}.{ts,tsx}',
          ],
          name: 'unit',
          environment: 'happy-dom',
        },
      },
      {
        test: {
          // Browser tests configuration
          include: [
            'tests/browser/**/*.{test,spec}.{ts,tsx}',
            'tests/**/*.browser.{test,spec}.{ts,tsx}',
          ],
          name: 'browser',
          browser: { // Keep existing browser settings
            provider: 'playwright',
            enabled: true,
            headless: false, // Assuming we want to keep this, adjust if not.
            instances: [
              { browser: 'chromium' },
            ],
          },
        }
      },
    ],
  },
})