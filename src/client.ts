import { SocialAuthError } from './errors'
import { OAuth2Runner } from './oauth2'
import { defaultOptions, defaultProviderConfig, providerPresets } from './options'
import { createStorage } from './storage'
import type {
  AuthenticateOptions,
  AuthenticateResult,
  ProviderConfig,
  SocialAuthOptions,
  StorageAdapter,
} from './types'
import { buildRedirectUri } from './utils'

/**
 * Standalone, framework-agnostic OAuth 2.0 client. Use directly when Vue's
 * dependency-injection plumbing is unwanted (workers, tests, non-Vue
 * frameworks); use {@link createSocialAuth} + {@link useSocialAuth} when in
 * a Vue app.
 *
 * @example
 * ```ts
 * import { SocialAuth } from '@digitalmaas/vue-social-auth'
 *
 * const auth = new SocialAuth({
 *   providers: {
 *     google: { clientId: '...', url: '/api/auth/google' },
 *   },
 * })
 * const session = await auth.authenticate('google')
 * ```
 *
 * @public
 */
export class SocialAuth {
  /** Storage adapter used for OAuth `state` and PKCE `code_verifier`. */
  readonly storage: StorageAdapter
  /**
   * Resolved provider configurations: every {@link providerPresets} entry
   * shallow-merged with the user-supplied overrides.
   */
  readonly providers: Record<string, Partial<ProviderConfig>>
  private readonly withCredentials: boolean

  /**
   * Create a new client.
   *
   * @param options - Library-wide options. See {@link SocialAuthOptions}.
   * @throws If the resolved storage adapter cannot be created (no custom
   *   adapter was supplied and `sessionStorage` is unavailable).
   */
  constructor(options: SocialAuthOptions = {}) {
    const merged = { ...defaultOptions, ...options }
    this.storage = createStorage(options.storage, merged.storageNamespace)
    this.withCredentials = merged.withCredentials
    this.providers = mergeProviders(options.providers ?? {})
  }

  /**
   * Authenticate the user against the named provider. Opens a popup at the
   * provider's authorization endpoint, waits for the redirect, then either
   * returns the popup response, exchanges the code with the configured
   * backend `url`, or exchanges directly at the provider's `tokenEndpoint`
   * (PKCE-only flow).
   *
   * @param provider - Key from {@link SocialAuthOptions.providers}
   *   (e.g. `'google'`, `'github'`, a custom name, or `'oauth2'`).
   * @param options - Per-call extras (extra payload, config overrides). See
   *   {@link AuthenticateOptions}.
   *
   * @returns The exchange response. See {@link AuthenticateResult}.
   *
   * @throws If the provider is unknown, `clientId` /
   *   `authorizationEndpoint` are missing after merging, the popup is
   *   blocked or closed by the user, the `state` parameter mismatches
   *   (possible CSRF), or the exchange endpoint returns a non-2xx
   *   response.
   */
  async authenticate(
    provider: string,
    options: AuthenticateOptions = {},
  ): Promise<AuthenticateResult> {
    const base = this.providers[provider]
    if (!base) throw new SocialAuthError('config', `Unknown OAuth provider: ${provider}`)

    const merged = {
      ...defaultProviderConfig,
      ...base,
      ...options.override,
      name: options.override?.name ?? base.name ?? provider,
    } as ProviderConfig

    // Resolved here, not at module load: presets carry a relative (or absent)
    // redirectUri so that importing the library without a `window` present
    // cannot bake an empty origin into them.
    merged.redirectUri = buildRedirectUri(merged.redirectUri)

    if (!merged.clientId) {
      throw new SocialAuthError('config', `Provider "${provider}" is missing clientId`)
    }
    if (!merged.authorizationEndpoint) {
      throw new SocialAuthError('config', `Provider "${provider}" is missing authorizationEndpoint`)
    }
    if (typeof merged.state === 'string') {
      throw new SocialAuthError(
        'config',
        `Provider "${provider}" sets \`state\` to a constant string. Pass a function ` +
          '(called once per flow), or omit it for a generated value.',
      )
    }
    // PKCE with nowhere to redeem the verifier: the flow would hand back a
    // code whose verifier this library has already consumed and destroyed.
    if (merged.pkce && !merged.url && !merged.tokenEndpoint) {
      throw new SocialAuthError(
        'config',
        `Provider "${provider}" enables pkce but sets neither \`url\` nor \`tokenEndpoint\`, ` +
          'so the code_verifier could never be exchanged.',
      )
    }

    const runner = new OAuth2Runner(this.storage, merged, {
      withCredentials: this.withCredentials,
    })
    return runner.run(options.userData)
  }
}

function mergeProviders(
  user: Record<string, Partial<ProviderConfig>>,
): Record<string, Partial<ProviderConfig>> {
  const out: Record<string, Partial<ProviderConfig>> = {}
  for (const key of Object.keys(providerPresets)) {
    out[key] = { ...providerPresets[key] }
  }
  for (const key of Object.keys(user)) {
    out[key] = { ...out[key], ...user[key] }
  }
  return out
}
