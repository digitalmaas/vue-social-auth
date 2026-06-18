export { SocialAuth } from './client'
export { createSocialAuth, SOCIAL_AUTH_KEY } from './plugin'
export { useSocialAuth } from './composable'
export { createStorage } from './storage'
export { createPkcePair } from './pkce'
export { providerPresets } from './options'
export type {
  AuthenticateOptions,
  AuthenticateResult,
  AuthorizationResponse,
  PopupOptions,
  ProviderConfig,
  SocialAuthOptions,
  StorageAdapter,
  StorageType,
} from './types'
export type { SocialAuthPlugin } from './plugin'
