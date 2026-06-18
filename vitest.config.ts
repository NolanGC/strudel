import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    dedupe: ['effect', 'vitest', '@vitest/runner'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@effect/vitest'],
      },
    },
  },
})
