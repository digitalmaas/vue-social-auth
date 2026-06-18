import { describe, expect, it } from 'vitest'

import { createPkcePair } from '../src/pkce'

describe('createPkcePair', () => {
  it('produces a verifier and S256 challenge of valid lengths', async () => {
    const pair = await createPkcePair()
    expect(pair.method).toBe('S256')
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43)
    expect(pair.verifier.length).toBeLessThanOrEqual(128)
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pair.challenge.length).toBe(43)
  })

  it('yields a different verifier on each call', async () => {
    const [a, b] = await Promise.all([createPkcePair(), createPkcePair()])
    expect(a.verifier).not.toBe(b.verifier)
  })
})
