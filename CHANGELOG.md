# Changelog

All notable changes to this project are documented here.
This file is generated from commit messages by [semantic-release](https://semantic-release.gitbook.io/) — edit the commits, not this file.

## [Unreleased]

First release is not yet published, so the breaking changes below are listed for
the record rather than as a migration burden.

### Added

- `postMessage` channel for returning the authorization result, enabling
  callback pages hosted on a different origin from the app. Same-origin polling
  is retained as a fallback, so a same-origin callback needs no callback page.
- `@digitalmaas/vue-social-auth/callback` entry point exporting
  `postAuthorizationResult()`, for the page hosted at the redirect URI. Separate,
  framework-free bundle (~2 kB).
- `popupTimeoutMs` provider option (default 5 minutes). Every flow now has a
  bounded lifetime.
- `SocialAuthError` with a `code` to branch on, plus structured `providerError`,
  `providerErrorDescription` and `status` fields.
- `npm run verify:package`, wired into `prepublishOnly`, asserting every path
  declared in `package.json` exists after a build.
- CI workflow: lint, format check, typecheck, dual-Vue test matrix, and a build
  with package verification.

### Changed

- PKCE now defaults to **on** for the direct token-endpoint flow (`tokenEndpoint`
  set, no `url`), where the browser redeems the code itself and is therefore a
  public client — the case
  [draft-ietf-oauth-browser-based-apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
  is most emphatic about. It stays **off** by default for the backend-exchange
  flow (`url`), because enabling it there changes a contract this library does
  not own: the backend must forward `codeVerifier` to the provider, and one that
  does not would begin failing with `invalid_grant`. Opting in is recommended
  and documented, including the backend steps it requires. Set `pkce` explicitly
  to override either default.
- **Breaking:** `state` on a provider config no longer accepts a constant
  string. Pass a function (called once per flow) or omit it for a generated
  value. A constant satisfies every check the library can make while providing
  none of the protection `state` exists for.
- **Breaking:** URL fragment parameters are no longer merged into the result, so
  an implicit-flow `access_token` is never returned.
- Provider-supplied `error_description` is no longer interpolated into
  `Error.message`; it is exposed as a structured field instead.
- Preset `redirectUri` values are resolved when `authenticate()` runs rather
  than at module load, so importing the library without a `window` no longer
  bakes an empty origin into every preset.

### Removed

- The `$auth` Vue prototype property from the base libraries. Use
  `useSocialAuth()` in `setup()`, or the `$socialAuth` global property the
  plugin registers.
- The `twitter`, `bitbucket`, `linkedin`, and `live` provider presets.
  Configure such providers under a custom key with their endpoints spelled
  out.

### Fixed

- Every pre-flight configuration failure now throws `SocialAuthError` with code
  `config` rather than a plain `Error`, including two cases that were not
  detected at all: a `state` pinned to a constant string (a JS caller has no
  type system to stop them) and `pkce: true` with neither `url` nor
  `tokenEndpoint`, which would have destroyed the verifier and returned a code
  that could never be exchanged.
- A `postMessage` envelope whose `params` was `null` threw out of the message
  listener and left the flow to hang until the timeout.
- A provider denial that omits `state` on the error redirect is now surfaced
  immediately instead of sitting until the timeout.
- The popup window name is per-flow. It was the provider name, so a second
  concurrent flow re-navigated the first flow's popup instead of opening its
  own.
- `window.open` throwing (rather than returning `null`) left the message
  listener attached.
- `postAuthorizationResult` rejects a `targetOrigin` that is not an exact
  origin, so `'*'` cannot be passed by accident.
- Abandoned flows no longer leak `sessionStorage` entries: because keys are
  scoped per flow, nothing would otherwise collect them. Each flow records an
  expiry and later flows sweep expired ones.
- A custom (non-preset) provider key never sent a `state` parameter, so every
  flow failed verification with "OAuth state mismatch — possible CSRF". `state`
  is now sent unconditionally for every provider.
- A cross-origin callback caused the flow to hang forever: the promise never
  settled and the poll interval ran for the life of the tab, leaving `state` and
  `code_verifier` in `sessionStorage`.
- `main` pointed at `./dist/index.cjs`, which the build never emitted, so any
  CommonJS consumer resolved a missing file.
- Two concurrent `authenticate()` calls for the same provider overwrote each
  other's stored state; storage keys are now scoped per flow.
- The PKCE pair is generated before anything is written to storage, so a
  `crypto.subtle` failure in a non-secure context no longer orphans a stored
  `state`.
