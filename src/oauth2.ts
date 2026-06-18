import type {
  AuthenticateResult,
  AuthorizationResponse,
  ProviderConfig,
  StorageAdapter,
} from './types'
import { OAuthPopup } from './popup'
import { createPkcePair } from './pkce'
import { camelCase, encodeForm, isFunction, isString, randomString } from './utils'

const STATE_PARAM_CATEGORIES = ['defaultUrlParams', 'requiredUrlParams', 'optionalUrlParams'] as const

export interface OAuth2RunnerOptions {
  withCredentials: boolean
}

export class OAuth2Runner {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly providerConfig: ProviderConfig,
    private readonly options: OAuth2RunnerOptions,
  ) {}

  async run(userData?: Record<string, unknown>): Promise<AuthenticateResult> {
    const name = this.providerConfig.name ?? 'oauth2'
    const stateKey = `${name}.state`
    const verifierKey = `${name}.verifier`

    const state = this.resolveState()
    this.storage.setItem(stateKey, state)

    let challenge: string | undefined
    if (this.providerConfig.pkce) {
      const pair = await createPkcePair()
      challenge = pair.challenge
      this.storage.setItem(verifierKey, pair.verifier)
    }

    let response: AuthorizationResponse
    try {
      const url = `${this.providerConfig.authorizationEndpoint}?${this.buildQuery(state, challenge)}`
      const popup = new OAuthPopup(url, name, this.providerConfig.popupOptions ?? {})
      const redirectUri = this.providerConfig.redirectUri ?? ''
      response = await popup.open(redirectUri)
    } catch (err) {
      this.storage.removeItem(stateKey)
      this.storage.removeItem(verifierKey)
      throw err
    }

    const storedState = this.takeItem(stateKey)
    if (!storedState) {
      this.storage.removeItem(verifierKey)
      throw new Error('OAuth state missing from storage — flow aborted')
    }
    if (response.state !== storedState) {
      this.storage.removeItem(verifierKey)
      throw new Error('OAuth state mismatch — possible CSRF')
    }

    const verifier = this.providerConfig.pkce ? this.takeItem(verifierKey) : undefined
    if (this.providerConfig.pkce && !verifier) {
      throw new Error('PKCE code_verifier missing from storage — flow aborted')
    }

    if (this.providerConfig.url) {
      return this.exchangeWithServer(response, userData, verifier)
    }
    if (verifier && this.providerConfig.tokenEndpoint) {
      return this.exchangeWithProvider(response, verifier)
    }
    return response
  }

  /** Read and immediately clear a storage entry. */
  private takeItem(key: string): string | null {
    const value = this.storage.getItem(key)
    this.storage.removeItem(key)
    return value
  }

  private resolveState(): string {
    const raw = this.providerConfig.state
    if (isFunction(raw)) return String(raw())
    if (isString(raw)) return raw
    return randomString(16)
  }

  private async exchangeWithServer(
    response: AuthorizationResponse,
    userData: Record<string, unknown> | undefined,
    verifier: string | undefined,
  ): Promise<AuthenticateResult> {
    const body: Record<string, unknown> = {
      ...userData,
      code: response.code,
      clientId: this.providerConfig.clientId,
      redirectUri: this.providerConfig.redirectUri,
    }
    if (response.state) body.state = response.state
    if (verifier) body.codeVerifier = verifier

    const res = await fetch(this.providerConfig.url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: this.options.withCredentials ? 'include' : 'same-origin',
    })
    return readJson(res)
  }

  private async exchangeWithProvider(
    response: AuthorizationResponse,
    verifier: string,
  ): Promise<AuthenticateResult> {
    const body = encodeForm({
      grant_type: 'authorization_code',
      code: response.code,
      client_id: this.providerConfig.clientId,
      redirect_uri: this.providerConfig.redirectUri ?? '',
      code_verifier: verifier,
    })
    const res = await fetch(this.providerConfig.tokenEndpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    })
    return readJson(res)
  }

  private buildQuery(state: string, challenge: string | undefined): string {
    const cfg = this.providerConfig as Record<string, unknown>
    const pairs: [string, string][] = []
    for (const category of STATE_PARAM_CATEGORIES) {
      const names = cfg[category] as string[] | undefined
      if (!Array.isArray(names)) continue
      for (const paramName of names) {
        const value = this.resolveParam(paramName, state)
        if (value === undefined) continue
        pairs.push([paramName, value])
      }
    }
    if (challenge) {
      pairs.push(['code_challenge', challenge])
      pairs.push(['code_challenge_method', 'S256'])
    }
    return pairs
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
  }

  private resolveParam(paramName: string, state: string): string | undefined {
    if (paramName === 'state') return state
    if (paramName === 'redirect_uri') {
      return this.providerConfig.redirectUri || undefined
    }
    if (paramName === 'scope') {
      const scope = this.providerConfig.scope
      if (!Array.isArray(scope) || scope.length === 0) return undefined
      const delimiter = this.providerConfig.scopeDelimiter ?? ' '
      const joined = scope.join(delimiter)
      return this.providerConfig.scopePrefix
        ? [this.providerConfig.scopePrefix, joined].join(delimiter)
        : joined
    }
    const key = camelCase(paramName)
    const raw = (this.providerConfig as Record<string, unknown>)[key]
    if (raw === undefined || raw === null) return undefined
    if (isFunction(raw)) return String((raw as () => unknown)())
    return String(raw)
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OAuth exchange failed (${res.status}): ${text || res.statusText}`)
  }
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    return (await res.json()) as Record<string, unknown>
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { raw: text }
  }
}
