---
date: 2026-11-24
status: Accepted
domain: authentication
related:
  - ADR-0001
  - ADR-0004
---

# ADR-0005: One world-scope API key, validated by the module

## Context

HTTP clients need a credential. The bridge forwards requests over a socket on
which it is already logged in as a world user, so Foundry itself only
authenticates the bridge, not the HTTP caller. The PRD (`prd/03-security.md`)
asks for a generated key, constant-time comparison and no key storage in the
bridge.

## Decision

- The module generates a 256-bit random key (`AuthManager.generateApiKey`) and
  stores it in the world setting `foundryvtt-local-rest-api.api-key`
  (`scope: "world"`, `config: false`). A GM views, copies and regenerates it in
  the module's API Configuration menu.
- HTTP clients send it as `x-api-key` or `Authorization: Bearer`. The bridge
  checks it against its own `API_KEY` and forwards it with each request; the
  module validates it again with a constant-time comparison.
- Per-user keys in user flags exist in `AuthManager` but no route depends on
  them; the shared key is the supported credential.

## Consequences

- The bridge's `API_KEY` and the world setting must hold the same value, and
  rotating the key means updating both.
- **World settings are sent to every client**, so any player can read the key
  from the browser console, and `generateApiKey` also prints it in a
  notification and in `console.log`. The key protects the API from callers
  outside the table, not from players. #5 tracks moving it out of a
  player-readable place.
- Until then, treat the key as shared with every player in the world, keep the
  bridge off the public internet, and rotate the key after setup and whenever
  it has been shown on screen (`docs/deployment-production.md`).
