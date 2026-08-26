import type { ProviderConfig, SocialAuthOptions } from './types'
import { camelCase, isFunction } from './utils'

export const defaultOptions: Required<
  Pick<SocialAuthOptions, 'storageNamespace' | 'withCredentials'>
> = {
  storageNamespace: 'vue-social-auth',
  withCredentials: false,
}

export const defaultProviderConfig: Partial<ProviderConfig> = {
  responseType: 'code',
  scopeDelimiter: ' ',
  defaultUrlParams: ['response_type', 'client_id', 'redirect_uri'],
}

/**
 * Built-in provider configurations. Every entry in
 * {@link SocialAuthOptions.providers} is shallow-merged onto the matching
 * preset, so consumers usually only supply `clientId` (and either `url` or
 * `tokenEndpoint`) for the major providers.
 *
 * Shipped presets:
 *
 * - `google` — Google Identity Services
 * - `github` — GitHub OAuth
 * - `facebook` — Facebook Login
 * - `instagram` — Instagram Basic Display (deprecated by Meta; prefer
 *   Facebook Login with Instagram scopes for new integrations)
 * - `oauth2` — a generic OAuth 2.0 skeleton with no provider-specific URLs
 *
 * `redirectUri` is deliberately left relative (or absent, meaning the current
 * origin). It is resolved against `window.location.origin` when
 * `authenticate()` runs, not when this module is imported — importing the
 * library on a server must not bake an empty origin into every preset.
 *
 * No preset lists `state` among its URL params: `state` is an invariant of
 * every flow and is appended unconditionally. See {@link buildAuthorizationQuery}.
 *
 * @public
 */
export const providerPresets: Record<string, Partial<ProviderConfig>> = {
  google: {
    name: 'google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    requiredUrlParams: ['scope'],
    optionalUrlParams: ['display'],
    scope: ['openid', 'profile', 'email'],
    scopeDelimiter: ' ',
    popupOptions: { width: 452, height: 633 },
  },

  github: {
    name: 'github',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    optionalUrlParams: ['scope'],
    scope: ['user:email'],
    scopeDelimiter: ' ',
    popupOptions: { width: 1020, height: 618 },
  },

  facebook: {
    name: 'facebook',
    authorizationEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
    redirectUri: '/',
    requiredUrlParams: ['display', 'scope'],
    scope: ['email'],
    scopeDelimiter: ',',
    display: 'popup',
    popupOptions: { width: 580, height: 400 },
  },

  instagram: {
    name: 'instagram',
    authorizationEndpoint: 'https://api.instagram.com/oauth/authorize',
    requiredUrlParams: ['scope'],
    scope: ['user_profile'],
    scopeDelimiter: ' ',
    popupOptions: { width: 500, height: 600 },
  },

  oauth2: {
    name: 'oauth2',
    authorizationEndpoint: '',
    optionalUrlParams: ['scope'],
    popupOptions: { width: 500, height: 600 },
  },
}

/** URL-parameter categories, expanded in order onto the authorization URL. */
const URL_PARAM_CATEGORIES = ['defaultUrlParams', 'requiredUrlParams', 'optionalUrlParams'] as const

/**
 * Build the authorization URL's query string for a resolved provider config.
 *
 * `state` is appended unconditionally rather than being driven by the param
 * categories. The library always verifies `state` on the way back, so a config
 * that omitted it would fail verification with a CSRF error that misdescribes
 * the cause.
 *
 * @param config - Fully resolved provider configuration.
 * @param state - The state value to send and later verify.
 * @param challenge - PKCE `code_challenge`, when PKCE is enabled.
 *
 * @returns An encoded query string, without the leading `?`.
 */
export function buildAuthorizationQuery(
  config: ProviderConfig,
  state: string,
  challenge?: string,
): string {
  const bag = config as Record<string, unknown>
  const pairs: [string, string][] = []

  for (const category of URL_PARAM_CATEGORIES) {
    const names = bag[category]
    if (!Array.isArray(names)) continue
    for (const paramName of names as string[]) {
      // `state` is appended below; never let a category emit a second copy.
      if (paramName === 'state') continue
      const value = resolveParam(config, paramName)
      if (value !== undefined) pairs.push([paramName, value])
    }
  }

  pairs.push(['state', state])
  if (challenge) {
    pairs.push(['code_challenge', challenge])
    pairs.push(['code_challenge_method', 'S256'])
  }

  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

function resolveParam(config: ProviderConfig, paramName: string): string | undefined {
  if (paramName === 'redirect_uri') return config.redirectUri || undefined
  if (paramName === 'scope') return joinScope(config)

  const raw = (config as Record<string, unknown>)[camelCase(paramName)]
  if (raw === undefined || raw === null) return undefined
  if (isFunction(raw)) return String(raw())
  return String(raw)
}

function joinScope(config: ProviderConfig): string | undefined {
  const { scope, scopePrefix } = config
  if (!Array.isArray(scope) || scope.length === 0) return undefined
  const delimiter = config.scopeDelimiter ?? ' '
  const joined = scope.join(delimiter)
  return scopePrefix ? [scopePrefix, joined].join(delimiter) : joined
}
