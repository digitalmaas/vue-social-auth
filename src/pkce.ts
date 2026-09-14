import { base64UrlEncode, randomString } from './utils'

/**
 * The PKCE secret pair sent across the authorization request and the
 * subsequent token exchange.
 *
 * @public
 */
export interface PkcePair {
  /**
   * Random URL-safe verifier (RFC 7636 §4.1). Held by the client and sent on
   * the token-exchange request.
   */
  verifier: string
  /**
   * Base64url-encoded SHA-256 digest of the verifier. Sent on the
   * authorization request as `code_challenge`.
   */
  challenge: string
  /** Challenge method advertised to the provider. Always `'S256'`. */
  method: 'S256'
}

/**
 * Generate a fresh PKCE verifier/challenge pair (RFC 7636, S256). Each call
 * returns a new pair backed by `crypto.getRandomValues` + `crypto.subtle`.
 *
 * Useful when wiring PKCE into a custom OAuth flow outside the bundled
 * {@link SocialAuth.authenticate} pipeline. When using
 * `pkce: true` on a provider, the library calls this internally and stores
 * the verifier for you.
 *
 * @returns A new {@link PkcePair}.
 *
 * @public
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomString(32)
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return { verifier, challenge: base64UrlEncode(digest), method: 'S256' }
}
