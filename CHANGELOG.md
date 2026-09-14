# Changelog

All notable changes to this project are documented here.
This file is generated from commit messages by [semantic-release](https://semantic-release.gitbook.io/) — edit the commits, not this file.

## 1.0.0 (2026-09-14)

### Features

* bake tokenEndpoint defaults into provider presets ([8f46d09](https://github.com/digitalmaas/vue-social-auth/commit/8f46d09f3a5e7dd0bffd97fefa7418ec33791401))
* **pkce:** default PKCE on where the browser is the OAuth client ([0f9bdcf](https://github.com/digitalmaas/vue-social-auth/commit/0f9bdcf3f84ef13bd3d23e26a0561b08a7f4da3c))
* **popup:** return results over postMessage, and always terminate ([ec0bfbc](https://github.com/digitalmaas/vue-social-auth/commit/ec0bfbc587117ed7fd6b5a0ed12450a8469573ae))
* scaffold OAuth 2.0 social auth library ([75c0ec4](https://github.com/digitalmaas/vue-social-auth/commit/75c0ec4d3b6cdeceebae63357204ec4d90358ecb))

### Bug Fixes

* close flow gaps found by full re-review ([84e72d2](https://github.com/digitalmaas/vue-social-auth/commit/84e72d2cd070f55c6a60330fd8570091d2d1e4ef))
* close the gaps found reviewing the remediation branch ([0c5411c](https://github.com/digitalmaas/vue-social-auth/commit/0c5411cd935bf7e9f295e53fd6e4cb37678641e0))
* emit UMD bundles as .cjs for require() ([d321ced](https://github.com/digitalmaas/vue-social-auth/commit/d321ced247e7f5d6536b930e20c6d17495976a03))
* fix release pipeline ([213980a](https://github.com/digitalmaas/vue-social-auth/commit/213980ab99a007ee0541003378f0126360d0cfb8))
* **lint:** clear oxlint findings ([4904bbc](https://github.com/digitalmaas/vue-social-auth/commit/4904bbc4a278ac72f3cef3250f8ddf1898da1b20))
* **oauth2:** always send state, and reject a constant state value ([e336c9b](https://github.com/digitalmaas/vue-social-auth/commit/e336c9b75706fd19f49083e62ba447a6a88c3d07))
* **pkg:** point main at an entry point that is actually built ([e82f3c5](https://github.com/digitalmaas/vue-social-auth/commit/e82f3c5d7ed59763660d5ace76da42230d412a1b))
* **types:** normalize takeItem return to string | undefined ([69c294e](https://github.com/digitalmaas/vue-social-auth/commit/69c294e92eebb1458f0fd1b3f17d93d457782d4d))

### Reverts

* drop tokenEndpoint defaults; explain PKCE flows ([7db7487](https://github.com/digitalmaas/vue-social-auth/commit/7db7487367a405a4fabf0f738cd587528691ce5f))

### Refactoring

* drop localStorage backend ([c5f9cf3](https://github.com/digitalmaas/vue-social-auth/commit/c5f9cf3e8208ba27b3fe4140411755ed7517bb36))
* scope storage per flow, drop dead code, raise the test seam ([c5a4d19](https://github.com/digitalmaas/vue-social-auth/commit/c5a4d193cab6961f77ba04b2f9077af90f49fe05))
* sessionStorage-only with delete-on-read semantics ([094b356](https://github.com/digitalmaas/vue-social-auth/commit/094b356fadb4f24338d12796f53272567a5e1758))

## 1.0.0

First release. A ground-up rewrite of `vue-authenticate`, reduced to the
OAuth 2.0 authorization-code flow in a popup.

### Highlights

- Vue 2.7 and Vue 3 from one package, via `vue-demi`. Plugin (`$socialAuth`)
  and composable (`useSocialAuth()`); the `$auth` prototype property is gone.
- Two ways to redeem the code: your backend (`url`) or the provider's token
  endpoint directly (`tokenEndpoint`). The library returns the exchange
  response and holds no session state of its own.
- PKCE (S256), on by default for the direct token-endpoint flow, opt-in for
  the backend flow.
- Result delivery over `postMessage` from a callback page, so the redirect
  URI may live on another origin. Same-origin polling remains as a fallback.
  The callback page imports `@digitalmaas/vue-social-auth/callback` and calls
  `postAuthorizationResult({ targetOrigin })`, where `targetOrigin` must be an
  exact origin.
- `SocialAuthError` with a `code` to branch on (`config`, `popup_blocked`,
  `popup_closed`, `timeout`, `state_mismatch`, `provider_error`,
  `exchange_failed`, ...). Provider error text is exposed as structured
  fields, never interpolated into `message`.
- `state` is always sent and always verified; a constant `state` is rejected.
  Storage is `sessionStorage` (custom adapters supported), scoped per flow so
  concurrent flows cannot collide, with expired flows swept automatically.
- Every flow has a bounded lifetime (`popupTimeoutMs`, default 5 minutes).
- Presets: `google`, `github`, `facebook`, `instagram`, `oauth2`. The
  `twitter`, `bitbucket`, `linkedin` and `live` presets from the base libraries
  were dropped; configure such providers under a custom key.
- Ships ESM, UMD (`.umd.cjs`) and type declarations; `window.fetch` only, no
  axios.
