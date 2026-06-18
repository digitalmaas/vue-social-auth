export type StorageType = 'local' | 'session' | 'memory'

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PopupOptions {
  width?: number
  height?: number
}

export type StateProvider = string | (() => string)

export interface ProviderConfig {
  /** Provider name. Defaults to the key in `providers`. */
  name?: string
  /** OAuth client ID. */
  clientId: string
  /** Authorization endpoint (where the popup opens). */
  authorizationEndpoint: string
  /** Redirect URI registered with the provider. */
  redirectUri?: string
  /** Backend URL that performs the code-for-token exchange. */
  url?: string
  /** Provider token endpoint. Used when `pkce: true` and `url` is unset. */
  tokenEndpoint?: string
  /** Enable PKCE (S256). Required for public clients. */
  pkce?: boolean
  /** OAuth scopes. */
  scope?: string[]
  scopePrefix?: string
  scopeDelimiter?: string
  /** OAuth `state`. String, function, or omitted (auto-generated). */
  state?: StateProvider
  responseType?: 'code'
  defaultUrlParams?: string[]
  requiredUrlParams?: string[]
  optionalUrlParams?: string[]
  popupOptions?: PopupOptions
  /** Free-form extra params merged into the authorization URL. */
  [key: string]: unknown
}

export interface AuthenticateOptions {
  /** Extra payload merged into the exchange POST body. */
  userData?: Record<string, unknown>
  /** Per-call provider config overrides. */
  override?: Partial<ProviderConfig>
}

export interface SocialAuthOptions {
  /** Where to keep OAuth `state` and PKCE `code_verifier`. Default: `session`. */
  storage?: StorageType | StorageAdapter
  /** Storage key prefix. Default: `vue-social-auth`. */
  storageNamespace?: string
  /** Send cookies on the exchange request. */
  withCredentials?: boolean
  /** Provider configurations, keyed by provider name. */
  providers?: Record<string, Partial<ProviderConfig>>
}

export interface AuthorizationResponse {
  code: string
  state?: string
  [key: string]: string | undefined
}

export type AuthenticateResult = AuthorizationResponse | Record<string, unknown>
