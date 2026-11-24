---
date: 2026-11-24
status: Accepted
domain: architecture
extends: ADR-0001
related:
  - ADR-0002
  - ADR-0005
---

# ADR-0004: One socket event, one answering Gamemaster, a logged-in bridge

## Context

ADR-0001 puts request handling in a browser client and the HTTP server in the
bridge. How messages travel between them was decided by trial in 2025 and
corrected in the v14 port (#4), which found that the bridge had never received
an answer:

- Foundry's server registers exactly one relay per package, `module.<id>`
  (`Package#registerCustomSocket`), broadcasting to the other connected clients
  and passing the sender's user id. The module answered on
  `module.<id>.response`, which the server drops.
- Every client with the module enabled receives every request. Without a rule
  for who answers, each connected client would answer once.
- A second listener registered at `init` handled every request twice.
- An anonymous bridge socket receives no module messages at all; the 2025
  "connect as anonymous client" change (`docs/FIX_SUMMARY.md`) made the bridge
  connect but not work.

## Decision

- Requests and responses share the one event, `module.foundryvtt-local-rest-api`.
  Responses carry `isResponse: true` and are addressed to the requester with
  `{recipients: [senderId]}`.
- Exactly one client answers: the designated active Gamemaster
  (`game.users.getDesignatedUser`), excluding the sending user unless the
  browser is logged in as that same user.
- The bridge logs in as a world user (GET and POST `/join`, then an
  authenticated socket), resolving the user's id from `FOUNDRY_USER_ID`, a
  16-character `FOUNDRY_USERNAME`, or a `getJoinData` lookup by name.
- One listener, owned by `FoundryLocalRestAPI.setupSocketHandlers`, which
  respects the `enable-api` setting.

## Consequences

- **A Gamemaster must be logged in through a browser** for any request to be
  answered. A browser logged in as the bridge's own user also counts. With no
  GM client, requests time out after `REQUEST_TIMEOUT`.
- The bridge's world user needs a password and should be a dedicated account
  (see `docs/deployment-production.md`). If its login fails the bridge falls
  back to an anonymous socket and every request times out without saying why;
  #5 tracks that.
- If two GM clients qualify, the designated one answers; the bridge keeps the
  first response for a request id and ignores the rest.
