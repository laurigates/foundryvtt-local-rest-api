---
date: 2026-11-24
status: Accepted
domain: architecture
related:
  - ADR-0003
  - ADR-0004
  - ADR-0005
---

# ADR-0001: A Foundry module plus a Node bridge server

Recorded 2026-11-24. The decision itself dates from 2025-08-24; this record
reconstructs it from the repository, the foundryvtt-mcp history and the
working notes kept at the time.

## Context

The goal is an HTTP API over a running FoundryVTT world that needs no
third-party relay service. Two facts about Foundry rule out the obvious
designs:

1. **Module code runs in the browser.** A module's `esmodules` load into each
   connected client. The first version tried to register Express routes on
   `game.socket.socket.io.httpServer`; on the client that property does not
   exist, `express` is not defined, and no route was ever served
   (`docs/ARCHITECTURE_ISSUES.md`).
2. **`game.socket` relays only between logged-in clients.** The server
   forwards a package's custom event (`module.<id>`) from one connected client
   to the others. An external Socket.IO client that is not logged in as a
   world user never takes part in that relay (`docs/SOLUTION.md`). In 14.369,
   `dist/server/sockets.mjs` registers package sockets only for a socket with a
   `userId`.

Some data also exists only inside a running client. The world payload a
logged-in socket receives (`joinGame`) is source data; dnd5e computes derived
values such as armour class, save and skill totals and Active Effect results
in `prepareData`, in the browser. Compendium search and server logs likewise
need code running inside Foundry.

## Decision

Split the API into two components:

- **The module** (`scripts/`) runs in a Gamemaster's browser, listens on
  `module.foundryvtt-local-rest-api`, reads `game.*` (including prepared,
  derived data), and answers each request on the same event (ADR-0004).
- **The bridge server** (`bridge-server/`) is a Node process that serves HTTP
  on port 3030, logs in to Foundry as a world user, sends each HTTP request
  over the module socket and returns the module's answer.

## History

- **2025-06-16.** The module was written inside foundryvtt-mcp as
  `foundry-local-rest-api/` (`7f8383a`, `ad8b506`), using the in-browser route
  design above. 2025-07-09: foundryvtt-mcp #66 made the MCP's REST usage
  explicit.
- **2025-08-21.** A standalone git repository was started locally (`570e493`,
  `3fa8d58`, today's `main`). The same day foundryvtt-mcp #84 (`4aae7d9`)
  removed the module from the MCP "to its own repository… to improve focus and
  enable independent versioning", linking the placeholder URL
  `github.com/yourusername/foundryvtt-local-rest-api`. The GitHub repository
  was not created then.
- **2025-08-21 to 08-29.** The bridge server, the socket handler, tests and
  docs (about 60 files) were written in that local checkout and not committed.
  `docs/ARCHITECTURE_ISSUES.md` and `docs/SOLUTION.md` (2025-08-24) record why
  the in-browser server could not work and why an anonymous bridge socket
  received nothing; this ADR's decision follows from them.
- **2025-10-13.** Lauri forked cclloyd/planeshift, a third-party REST server
  for Foundry, as laurigates/planeshift, contributed upstream (cclloyd/planeshift
  #3, #4) and used it while working on the MCP. laurigates/planeshift#1 merged
  2026-07-14.
- **2025-11-16.** The harness moved to felddy's Docker image with a
  `bridge-server` service built from the module's uncommitted working tree in
  `data/`, so the bridge kept working locally without any commit.
- **2026-02-10.** foundryvtt-mcp #89 added direct Socket.IO login as a world
  user, and the MCP's ADR-001 (2026-03-03) chose that transport, "no custom
  module required". The belief at the time was that this made the module
  unnecessary, so it was left alone.
- **2026-11.** foundryvtt-mcp #308 and #309 showed the gap: over the direct
  socket, derived dnd5e values printed as "Unknown" or +0. #309 computes what
  can be derived exactly from source data (ability modifiers, level,
  proficiency); the rest needs a client that has run `prepareData`, which is
  what the module provides.
- **2026-11-23.** laurigates/foundryvtt-local-rest-api was created; the
  local work was committed as #3 (one leaked key scrubbed) and ported to v14 in
  #4 (ADR-0002). The gitops adoption is laurigates/gitops#442.

## Alternatives considered

| Option | Why not |
|---|---|
| HTTP routes registered from module code | Impossible: module code runs in the browser (fact 1). |
| Anonymous bridge socket | Receives no module messages (fact 2); every request times out. |
| HTTP long-polling from the module to the bridge (`docs/SOLUTION.md` option 1) | Workable, but needs a second listener and queue; once the bridge logs in as a world user the existing relay carries requests both ways. |
| A server-side Foundry patch | Not installable as a package; breaks on every core update. |
| planeshift | A separate third-party server with its own scope; it was used for MCP work but does not run inside a browser client, so it does not supply `prepareData` results. |
| Direct Socket.IO only (foundryvtt-mcp ADR-001) | Kept as the MCP's primary transport; it cannot see derived values, compendium search or logs. |

## Consequences

- A Gamemaster browser client must stay connected for the API to answer;
  without one, requests time out (ADR-0004).
- The bridge holds a world user's credentials and must run where it can reach
  Foundry (see `docs/deployment-production.md`).
- Two deployables with separate lifecycles: the module ships through the
  Foundry manifest URL, the bridge as a Node service or container.
- foundryvtt-mcp uses both transports ("dual mode", Lauri's decision): direct
  Socket.IO for world data and writes, this API for what needs a client.
