import { describe, expect, it, vi } from 'vitest'

import {
  callbackEnvelope,
  deliverCallbackMessage,
  fakeCrossOriginPopup,
  useFakeClock,
} from './helpers'

/**
 * Two flows for the SAME provider, in flight at once — a double-clicked login
 * button, or two providers configured under one preset key.
 *
 * The review found storage keys were scoped per provider name, so the second
 * flow overwrote the first flow's stored state and the first then failed
 * verification with a CSRF error.
 */
describe('integration: concurrent flows for one provider', () => {
  useFakeClock()

  const CALLBACK_ORIGIN = 'https://auth.example.test'

  it('keeps two simultaneous flows separate and resolves each with its own result', async () => {
    const { SocialAuth } = await import('../../src')

    const popups: ReturnType<typeof fakeCrossOriginPopup>[] = []
    const urls: string[] = []
    vi.spyOn(window, 'open').mockImplementation((...args: unknown[]) => {
      urls.push(String(args[0]))
      const popup = fakeCrossOriginPopup()
      popups.push(popup)
      return popup as unknown as Window
    })

    const auth = new SocialAuth({
      providers: {
        mycorp: {
          clientId: 'CID',
          authorizationEndpoint: 'https://provider.test/auth',
          redirectUri: `${CALLBACK_ORIGIN}/callback`,
        },
      },
    })

    const first = auth.authenticate('mycorp')
    const second = auth.authenticate('mycorp')
    await vi.advanceTimersByTimeAsync(10)

    expect(popups).toHaveLength(2)
    const stateOf = (i: number) => new URL(urls[i]!).searchParams.get('state')!
    expect(stateOf(0)).not.toBe(stateOf(1))

    // resolve them out of order: the second flow answers first
    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'SECOND_CODE', state: stateOf(1) }),
      origin: CALLBACK_ORIGIN,
      source: popups[1],
    })
    deliverCallbackMessage({
      data: callbackEnvelope({ code: 'FIRST_CODE', state: stateOf(0) }),
      origin: CALLBACK_ORIGIN,
      source: popups[0],
    })

    await expect(first).resolves.toMatchObject({ code: 'FIRST_CODE' })
    await expect(second).resolves.toMatchObject({ code: 'SECOND_CODE' })
    expect(window.sessionStorage.length).toBe(0)
  })
})
