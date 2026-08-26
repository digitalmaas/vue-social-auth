import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// imports the v3 alias directly (this spec is Vue-3-only; excluded from the v2 run)
import { createApp, defineComponent, h } from 'vue3'

import { createSocialAuth, useSocialAuth } from '../../src'
import { jsonResponse, stubFetch, stubPopupOpenEchoingState } from './helpers'

/**
 * End-to-end through the public API: Vue plugin install → `useSocialAuth`
 * inject → client → real `OAuth2Runner` → real `OAuthPopup` poll → backend
 * exchange. Only the two true I/O seams are mocked: `window.open` and `fetch`.
 */
describe('integration: Vue plugin → composable → backend exchange', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('authenticates via the real popup poll and posts the code to the backend url', async () => {
    const fetchMock = stubFetch(jsonResponse({ token: 'JWT' }))
    const open = stubPopupOpenEchoingState('https://app.test/callback', { code: 'AUTH_CODE' })

    let pending: Promise<unknown> | undefined
    const Comp = defineComponent({
      setup() {
        const auth = useSocialAuth()
        pending = auth.authenticate('google')
        return () => h('div')
      },
    })

    const app = createApp(Comp).use(
      createSocialAuth({
        providers: {
          google: {
            clientId: 'CID',
            redirectUri: 'https://app.test/callback',
            url: '/api/auth/google',
          },
        },
      }),
    )
    app.mount(document.createElement('div'))

    // popup poll runs on setInterval(POLL_INTERVAL_MS = 250)
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    const result = await pending

    expect(open).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/auth/google')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      code: 'AUTH_CODE',
      clientId: 'CID',
      redirectUri: 'https://app.test/callback',
    })
    expect(result).toEqual({ token: 'JWT' })
  })

  it('forwards per-call userData into the exchange body', async () => {
    const fetchMock = stubFetch(jsonResponse({ token: 'JWT' }))
    stubPopupOpenEchoingState('https://app.test/callback', { code: 'AUTH_CODE' })

    const app = createApp(
      defineComponent({
        setup: () => () => h('div'),
      }),
    )
    const plugin = createSocialAuth({
      providers: {
        google: {
          clientId: 'CID',
          redirectUri: 'https://app.test/callback',
          url: '/api/auth/google',
        },
      },
    })
    app.use(plugin)

    const pending = plugin.instance.authenticate('google', {
      userData: { invitedBy: 'abc' },
    })
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    await pending

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toMatchObject({ invitedBy: 'abc', code: 'AUTH_CODE' })
  })

  it('returns the raw authorization response when no exchange is configured', async () => {
    stubPopupOpenEchoingState('https://app.test/callback', { code: 'RAW_CODE' })
    const fetchMock = stubFetch(jsonResponse({ never: true }))

    const auth = createSocialAuth({
      providers: {
        // generic provider: no `url`, no `tokenEndpoint` → popup response passes through
        plain: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: 'https://app.test/callback',
        },
      },
    }).instance

    const pending = auth.authenticate('plain')
    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()
    const result = await pending

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ code: 'RAW_CODE' })
    expect((result as { state?: string }).state).toBeTruthy()
  })
})
