import { describe, expect, it } from 'vitest'

import { buildAuthorizationQuery } from '../../src/options'
import type { ProviderConfig } from '../../src/types'
import { parseQuery } from '../../src/utils'

const query = (config: ProviderConfig, state = 'S', challenge?: string) =>
  parseQuery(buildAuthorizationQuery(config, state, challenge))

/**
 * Authorization-URL construction is a pure function of the resolved provider
 * config, so it needs no mocking at all — this used to be asserted by standing
 * up a runner and intercepting the popup constructor.
 */
describe('buildAuthorizationQuery', () => {
  const base: ProviderConfig = {
    name: 'github',
    clientId: 'CLIENT_ID',
    authorizationEndpoint: 'https://example.test/authorize',
    redirectUri: 'https://app.test/callback',
    responseType: 'code',
    defaultUrlParams: ['response_type', 'client_id', 'redirect_uri'],
  }

  it('expands the default param category', () => {
    const params = query(base)
    expect(params.response_type).toBe('code')
    expect(params.client_id).toBe('CLIENT_ID')
    expect(params.redirect_uri).toBe('https://app.test/callback')
  })

  it('joins scope with the configured delimiter', () => {
    const params = query({
      ...base,
      optionalUrlParams: ['scope'],
      scope: ['user:email', 'read:org'],
      scopeDelimiter: ' ',
    })
    expect(params.scope).toBe('user:email read:org')
  })

  it('applies scopePrefix using the same delimiter', () => {
    const params = query({
      ...base,
      requiredUrlParams: ['scope'],
      scope: ['email'],
      scopePrefix: 'openid',
      scopeDelimiter: ',',
    })
    expect(params.scope).toBe('openid,email')
  })

  it('omits scope entirely when none is configured', () => {
    const params = query({ ...base, optionalUrlParams: ['scope'] })
    expect(params.scope).toBeUndefined()
  })

  it('camel-cases param names when reading them off the config', () => {
    const params = query({ ...base, optionalUrlParams: ['access_type'], accessType: 'offline' })
    expect(params.access_type).toBe('offline')
  })

  it('calls a function-valued param once per build', () => {
    let calls = 0
    const params = query({
      ...base,
      optionalUrlParams: ['nonce'],
      nonce: () => {
        calls += 1
        return 'N'
      },
    })
    expect(params.nonce).toBe('N')
    expect(calls).toBe(1)
  })

  it('always emits state, whatever the categories say', () => {
    const params = query({ ...base, defaultUrlParams: [], optionalUrlParams: [] }, 'THE_STATE')
    expect(params.state).toBe('THE_STATE')
  })

  it('emits the PKCE challenge and its method only when a challenge is given', () => {
    expect(query(base).code_challenge).toBeUndefined()
    const params = query(base, 'S', 'CHALLENGE')
    expect(params.code_challenge).toBe('CHALLENGE')
    expect(params.code_challenge_method).toBe('S256')
  })

  it('percent-encodes keys and values', () => {
    const raw = buildAuthorizationQuery(
      { ...base, redirectUri: 'https://app.test/cb?a=b&c=d' },
      'a b&c',
    )
    expect(raw).toContain('redirect_uri=https%3A%2F%2Fapp.test%2Fcb%3Fa%3Db%26c%3Dd')
    expect(raw).toContain('state=a%20b%26c')
  })
})
