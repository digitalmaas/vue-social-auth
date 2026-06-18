import type {
  AuthenticateOptions,
  AuthenticateResult,
  ProviderConfig,
  SocialAuthOptions,
  StorageAdapter,
} from './types'
import { defaultOptions, defaultProviderConfig, providerPresets } from './options'
import { createStorage } from './storage'
import { OAuth2Runner } from './oauth2'

export class SocialAuth {
  readonly storage: StorageAdapter
  readonly providers: Record<string, Partial<ProviderConfig>>
  private readonly withCredentials: boolean

  constructor(options: SocialAuthOptions = {}) {
    const merged = { ...defaultOptions, ...options }
    this.storage = createStorage(options.storage, merged.storageNamespace)
    this.withCredentials = merged.withCredentials
    this.providers = mergeProviders(options.providers ?? {})
  }

  async authenticate(
    provider: string,
    options: AuthenticateOptions = {},
  ): Promise<AuthenticateResult> {
    const base = this.providers[provider]
    if (!base) throw new Error(`Unknown OAuth provider: ${provider}`)

    const merged = {
      ...defaultProviderConfig,
      ...base,
      ...options.override,
      name: options.override?.name ?? base.name ?? provider,
    } as ProviderConfig

    if (!merged.clientId) {
      throw new Error(`Provider "${provider}" is missing clientId`)
    }
    if (!merged.authorizationEndpoint) {
      throw new Error(`Provider "${provider}" is missing authorizationEndpoint`)
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
