import type { App as App3 } from 'vue-demi'

import { SocialAuth } from './client'
import type { SocialAuthOptions } from './types'

/**
 * Internal Vue `provide`/`inject` key used by {@link useSocialAuth} to
 * locate the active {@link SocialAuth} instance.
 *
 * @internal
 */
export const SOCIAL_AUTH_KEY = Symbol('vue-social-auth')

/**
 * Vue plugin object returned by {@link createSocialAuth}. Pass it to
 * `app.use(...)` on Vue 3 or `Vue.use(...)` on Vue 2.7+. The wrapped
 * {@link SocialAuth} instance is also exposed as `.instance` for callers
 * that want it without going through the composable.
 *
 * @public
 */
export interface SocialAuthPlugin {
  /** Underlying client instance. */
  readonly instance: SocialAuth
  /**
   * Vue plugin install hook. Accepts both the Vue 3 `App` and the Vue 2.7+
   * global constructor; the right wiring is chosen at call time.
   */
  install(app: App3 | unknown): void
}

declare module 'vue-demi' {
  interface ComponentCustomProperties {
    /**
     * Active {@link SocialAuth} instance, registered by the
     * {@link SocialAuthPlugin}. Available on every component as
     * `this.$socialAuth` in Options API code.
     */
    $socialAuth: SocialAuth
  }
}

/**
 * Build the Vue plugin wrapping a {@link SocialAuth} instance. Registers the
 * instance via Vue 3 `provide` (so {@link useSocialAuth} can pick it up) and
 * exposes it as `this.$socialAuth` for Options-API consumers on both Vue 2.7+
 * and Vue 3.
 *
 * @param options - Library options forwarded to the {@link SocialAuth}
 *   constructor.
 *
 * @returns A {@link SocialAuthPlugin} ready to pass to `app.use(...)`.
 *
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { createSocialAuth } from '@digitalmaas/vue-social-auth'
 *
 * const socialAuth = createSocialAuth({
 *   providers: { google: { clientId: '...' } },
 * })
 * createApp(App).use(socialAuth).mount('#app')
 * ```
 *
 * @public
 */
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
