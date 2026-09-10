import { defineConfig } from 'tsdown'

/**
 * Two single-entry builds rather than one two-entry build: UMD cannot be
 * emitted from a code-splitting build, and code splitting is what a multi-entry
 * build does. Each entry is self-contained, which is what we want anyway — the
 * callback page must not pull in the client.
 */
const shared = {
  format: ['esm', 'umd'] as const,
  platform: 'browser' as const,
  target: 'es2020',
  // The package is `"type": "module"`, so the UMD bundle must NOT be a `.js`
  // file: Node would parse it as ESM and the UMD factory's exports never
  // bind — require() then yields an empty object.
  // (tsdown already inserts `.umd` before the extension for UMD outputs.)
  outExtensions: ({ format }: { format: string }) =>
    format === 'umd' ? { js: '.cjs' } : undefined,
  dts: true,
  sourcemap: true,
  treeshake: true,
  deps: { neverBundle: ['vue', 'vue-demi'] },
  outputOptions: {
    codeSplitting: false,
    globals: {
      vue: 'Vue',
      'vue-demi': 'VueDemi',
    },
  },
}

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    globalName: 'VueSocialAuth',
    clean: true,
  },
  {
    ...shared,
    entry: { callback: 'src/callback.ts' },
    globalName: 'VueSocialAuthCallback',
    // the first config already cleaned the directory
    clean: false,
  },
])
