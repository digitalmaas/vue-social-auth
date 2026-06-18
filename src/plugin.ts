import type { App as App3 } from 'vue-demi'
import { SocialAuth } from './client'
import type { SocialAuthOptions } from './types'

export const SOCIAL_AUTH_KEY = Symbol('vue-social-auth')

export interface SocialAuthPlugin {
  readonly instance: SocialAuth
  install(app: App3 | unknown): void
}

declare module 'vue-demi' {
  interface ComponentCustomProperties {
    $socialAuth: SocialAuth
  }
}

export function createSocialAuth(options: SocialAuthOptions = {}): SocialAuthPlugin {
  const instance = new SocialAuth(options)

  return {
    instance,
    install(app: unknown): void {
      const target = app as {
        provide?: (key: symbol, value: unknown) => void
        config?: { globalProperties?: Record<string, unknown> }
        prototype?: Record<string, unknown>
      }
      if (typeof target.provide === 'function') {
        target.provide(SOCIAL_AUTH_KEY, instance)
      }
      if (target.config?.globalProperties) {
        target.config.globalProperties.$socialAuth = instance
      } else if (target.prototype) {
        target.prototype.$socialAuth = instance
      }
    },
  }
}
