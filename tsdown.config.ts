import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'umd'],
  globalName: 'VueSocialAuth',
  platform: 'browser',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['vue', 'vue-demi'],
  outputOptions: {
    globals: {
      vue: 'Vue',
      'vue-demi': 'VueDemi',
    },
  },
})
