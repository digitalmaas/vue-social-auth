import type { ProviderConfig, SocialAuthOptions } from './types'
import { buildRedirectUri } from './utils'

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
 * @public
 */
export const providerPresets: Record<string, Partial<ProviderConfig>> = {
  google: {
    name: 'google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    redirectUri: buildRedirectUri(),
    requiredUrlParams: ['scope'],
    optionalUrlParams: ['display', 'state'],
    scope: ['openid', 'profile', 'email'],
    scopeDelimiter: ' ',
    popupOptions: { width: 452, height: 633 },
  },

  github: {
    name: 'github',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    redirectUri: buildRedirectUri(),
    optionalUrlParams: ['scope', 'state'],
    scope: ['user:email'],
    scopeDelimiter: ' ',
    popupOptions: { width: 1020, height: 618 },
  },

  facebook: {
    name: 'facebook',
    authorizationEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
    redirectUri: buildRedirectUri('/'),
    requiredUrlParams: ['display', 'scope'],
    optionalUrlParams: ['state'],
    scope: ['email'],
    scopeDelimiter: ',',
    display: 'popup',
    popupOptions: { width: 580, height: 400 },
  },

  instagram: {
    name: 'instagram',
    authorizationEndpoint: 'https://api.instagram.com/oauth/authorize',
    redirectUri: buildRedirectUri(),
    requiredUrlParams: ['scope'],
    optionalUrlParams: ['state'],
    scope: ['user_profile'],
    scopeDelimiter: ' ',
    popupOptions: { width: 500, height: 600 },
  },

  oauth2: {
    name: 'oauth2',
    authorizationEndpoint: '',
    redirectUri: buildRedirectUri(),
    optionalUrlParams: ['scope', 'state'],
    popupOptions: { width: 500, height: 600 },
  },
}
