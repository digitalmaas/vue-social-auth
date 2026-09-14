import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __VUE_PROD_DEVTOOLS__: false,
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
})
