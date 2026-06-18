import { base64UrlEncode, randomString } from './utils'

export interface PkcePair {
  verifier: string
  challenge: string
  method: 'S256'
}

/**
 * Generate a PKCE verifier and S256 challenge.
 * Verifier is a 43-char URL-safe random string (RFC 7636 §4.1).
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomString(32)
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return { verifier, challenge: base64UrlEncode(digest), method: 'S256' }
}
