# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Fixed

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
