import { getCurrentInstance, inject } from 'vue-demi'

import type { SocialAuth } from './client'
import { SOCIAL_AUTH_KEY } from './plugin'

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
