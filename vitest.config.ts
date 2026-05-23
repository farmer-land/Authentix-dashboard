import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(), // reads tsconfig.json paths — handles @/lib, @/components, @/* correctly
    react(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**', '**/.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'app/(auth)/**/*.ts',
        'app/(auth)/**/*.tsx',
        'app/api/auth/**/*.ts',
        'app/dashboard/**/generate-certificate/components/**/*.tsx',
        'src/lib/**/*.ts',
      ],
      exclude: ['**/*.d.ts', '**/node_modules/**', '**/__tests__/**'],
    },
  },
});
