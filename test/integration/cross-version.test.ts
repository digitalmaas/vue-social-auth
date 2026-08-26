import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isVue2 } from 'vue-demi'

import { createSocialAuth, useSocialAuth, type SocialAuth } from '../../src'
import { jsonResponse, mountWithPlugin, stubFetch, stubPopupOpenEchoingState } from './helpers'

/**
 * Version-portable integration test. Imports Vue through `vue-demi`, so this
 * single spec validates the only version-specific surface of the library —
 * `plugin.ts` install() and `composable.ts` resolution — under whichever Vue
 * is installed.
 *
 * - Vue 3 (default install): plugin uses `app.provide`, composable resolves
 *   via `inject`.
 * - Vue 2.7 (matrix job, see bottom of file): plugin sets
 *   `Vue.prototype.$socialAuth`, composable falls back to the global property.
 */
describe(`integration: cross-version plugin + composable (isVue2=${isVue2})`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('resolves the instance via useSocialAuth() and authenticates end-to-end', async () => {
    const fetchMock = stubFetch(jsonResponse({ token: 'JWT' }))
    stubPopupOpenEchoingState('https://app.test/callback', { code: 'AUTH_CODE' })

    const plugin = createSocialAuth({
      providers: {
        google: {
          clientId: 'CID',
          redirectUri: 'https://app.test/callback',
          url: '/api/auth/google',
        },
      },
    })

    let resolved: SocialAuth | undefined
    let pending: Promise<unknown> | undefined
    mountWithPlugin(() => {
      resolved = useSocialAuth()
      pending = resolved.authenticate('google')
    }, plugin)

    // composable must hand back the same instance the plugin wraps
    expect(resolved).toBe(plugin.instance)

    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    const result = await pending

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/google')
    expect(JSON.parse(opts.body as string)).toMatchObject({ code: 'AUTH_CODE', clientId: 'CID' })
    expect(result).toEqual({ token: 'JWT' })
  })
})

/*
 * ── Running this against Vue 2.7 ────────────────────────────────────────────
 * Both Vue versions coexist as npm aliases in devDependencies
 * (`vue2: npm:vue@^2.7.0`, `vue3: npm:vue@^3.4.0`; no bare `vue`) +
 * `vue-demi-switch <ver> <alias>`, which rewrites vue-demi's shim to import
 * from the alias. Wired into package.json scripts:
 *
 *   test:unit       → test:unit:vue3 && test:unit:vue2   (sequential)
 *   test:unit:vue3  → vue-demi-switch 3 vue3 && vitest run
 *   test:unit:vue2  → vue-demi-switch 2.7 vue2 && vitest run --exclude … && vue-demi-switch 3 vue3
 *
 * `vue-demi-switch` only redirects vue-demi's own imports, NOT direct imports
 * in test files — so `vue-flow.test.ts` (imports `createApp` from 'vue3') is
 * Vue-3-only and is excluded from the v2 run. This spec plus
 * `pkce-flow.test.ts` / `errors.test.ts` import via vue-demi / src and run on
 * both. The v2 script restores the switch to 3 at the end, so the tree never
 * ends dirty. The switch is shared mutable state — never run the two runs in
 * parallel.
 */
