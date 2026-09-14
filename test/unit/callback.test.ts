import { describe, expect, it } from 'vitest'

import { postAuthorizationResult } from '../../src/callback'
import { withStubbedCallbackWindow } from '../integration/helpers'

/**
 * The callback page half of the postMessage protocol. The parent half is
 * covered by test/integration/postmessage-flow.test.ts.
 */
function run(search: string, targetOrigin = 'https://app.example.test') {
  const calls: { message: unknown; origin: unknown }[] = []
  const opener = {
    postMessage: (message: unknown, origin: unknown) => void calls.push({ message, origin }),
  }
  const { closed } = withStubbedCallbackWindow({ search, opener }, () =>
    postAuthorizationResult({ targetOrigin }),
  )
  return { calls, closed }
}

describe('postAuthorizationResult', () => {
  it('posts the query parameters to the opener', () => {
    const { calls } = run('code=THE_CODE&state=THE_STATE')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.message).toEqual({
      source: 'vue-social-auth',
      params: { code: 'THE_CODE', state: 'THE_STATE' },
    })
  })

  it('posts to the exact target origin it was given, never a wildcard', () => {
    const { calls } = run('code=C&state=S', 'https://app.example.test')

    expect(calls[0]!.origin).toBe('https://app.example.test')
    expect(calls[0]!.origin).not.toBe('*')
  })

  it('relays a provider error response as-is', () => {
    const { calls } = run('error=access_denied&error_description=nope')

    expect(calls[0]!.message).toMatchObject({
      params: { error: 'access_denied', error_description: 'nope' },
    })
  })

  it('closes the popup after posting', () => {
    expect(run('code=C&state=S').closed).toBe(true)
  })

  it('throws when the page has no opener, rather than silently doing nothing', () => {
    const calls: unknown[] = []
    expect(() =>
      withStubbedCallbackWindow({ search: 'code=C', opener: null }, () =>
        postAuthorizationResult({ targetOrigin: 'https://app.example.test' }),
      ),
    ).toThrow(/no opener/i)
    expect(calls).toHaveLength(0)
  })

  it.each(['*', 'https://app.example.test/', 'app.example.test', ''])(
    'refuses to post to an unsafe targetOrigin: %j',
    (bad) => {
      expect(() => run('code=C&state=S', bad)).toThrow(/targetOrigin/i)
    },
  )
})
