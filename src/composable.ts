import { getCurrentInstance, inject } from 'vue-demi'

import type { SocialAuth } from './client'
import { SOCIAL_AUTH_KEY } from './plugin'

/**
 * Composition-API hook returning the {@link SocialAuth} instance registered
 * by {@link createSocialAuth}. Works in both Vue 2.7+ and Vue 3 setup
 * functions.
 *
 * Resolution order:
 *
 * 1. Vue 3 `inject` (preferred). Set up by the plugin's `provide`.
 * 2. Options-API global property `$socialAuth`, which the plugin also
 *    registers — used when `inject` returns `undefined` (e.g. when calling
 *    from outside `setup()`).
 *
 * @returns The active {@link SocialAuth} instance.
 *
 * @throws If neither lookup finds an instance. Most often means
 *   `app.use(createSocialAuth(...))` was not called.
 *
 * @example
 * ```ts
 * const socialAuth = useSocialAuth()
 * const session = await socialAuth.authenticate('google')
 * ```
 *
 * @public
 */
export function useSocialAuth(): SocialAuth {
  const fromInject = inject<SocialAuth | undefined>(SOCIAL_AUTH_KEY, undefined)
  if (fromInject) return fromInject

  const instance = getCurrentInstance()
  const fromGlobal = (instance?.proxy as unknown as { $socialAuth?: SocialAuth } | null)
    ?.$socialAuth
  if (fromGlobal) return fromGlobal

  throw new Error(
    '[vue-social-auth] No instance found. Call app.use(createSocialAuth(...)) before useSocialAuth().',
  )
}
