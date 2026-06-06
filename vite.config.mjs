import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser/providers/playwright';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm'],
  },
  test: {
    projects: [
      {
        test: {
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.unit.{test,spec}.{ts,tsx}'],
          name: 'unit',
          environment: 'happy-dom',
        },
      },
      {
        test: {
          include: [
            'tests/__tests__/**/*.{test,spec}.{ts,tsx}',
            'tests/browser/**/*.{test,spec}.{ts,tsx}',
            'tests/**/*.browser.{test,spec}.{ts,tsx}',
          ],
          name: 'browser',
          browser: {
            provider: playwright(),
            enabled: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ['dist/**', 'node_modules/**'],
    rules: {
      'no-floating-promises': 'off',
      'no-unused-vars': 'off',
    },
  },
  fmt: {
    ignorePatterns: ['dist/**', 'node_modules/**'],
    singleQuote: true,
  },
  staged: {
    '*.{js,ts,tsx,mjs,vue,svelte}': 'vp check --fix',
  },
});
