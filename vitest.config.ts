import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    browser: {
      provider: 'playwright',
      enabled: true,
      headless: false,
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
}) 