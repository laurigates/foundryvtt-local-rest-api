# Production deployment

How to run the module and the bridge next to a production Foundry server.
This guide prepares the deployment; nothing in it has been run against a
production server yet, and the v14 code paths are still waiting on their first
live run (ADR-0002).

What you deploy:

| Part | Where it runs | How it ships |
|---|---|---|
| Module (`scripts/`, `lang/`, `templates/`) | Inside Foundry, in each browser client | Foundry installs it from the manifest URL |
| Bridge (`bridge-server/`) | A Node process or container that can reach Foundry | Built from this repository |

The architecture and its constraints are in [ADR-0001](adrs/0001-module-plus-node-bridge.md)
and [ADR-0004](adrs/0004-one-socket-event-one-answering-gm.md).

## Before you start

- A tagged release must exist. Releases come from release-please, which needs
  laurigates/gitops#442 merged and applied (it pushes the App credentials) and
  the module code from #3 and #4 on `main`.
- Foundry 13 or 14. On 14 the module loads with a "not verified" warning until
  `compatibility.verified` is raised after the live run.
- A world user for the bridge, with a password (step 3).

## 1. Install the module

In Foundry's setup screen: **Add-on Modules → Install Module**, and paste the
manifest URL:

```
https://github.com/laurigates/foundryvtt-local-rest-api/releases/latest/download/module.json
```

The manifest's `download` field points at the zip attached to the same
release. The zip contains only the client files; the bridge is not in it.

## 2. Enable the module and the API

In the world, as a Gamemaster:

1. **Game Settings → Manage Modules**: enable *Foundry Local REST API*.
2. **Game Settings → Configure Settings → Foundry Local REST API**: turn on
   **Enable REST API** (setting `enable-api`). Leave **Log API Requests** off
   unless you are debugging.
3. Open **API Configuration** from the same page. On the first load with no
   key, the module generates one; copy it from here. Treat this first key as
   disposable (see "Security caveats").

## 3. Create the bridge's world user

**Game Settings → User Management**: add a user for the bridge, for example
`rest-bridge`, with a long random password. Foundry relays module messages
only for logged-in users, so the bridge must log in as a world user; the
foundryvtt.com account is not a world user and does not work.

The role the bridge user needs has not been settled by a live run. From the
code: requests are answered by a Gamemaster's browser and run with that GM's
permissions, so the bridge user does not need the Gamemaster role for the
relay. It needs it only if you want a browser logged in as the bridge user to
be the answering client (ADR-0004).

Its 16-character document id (`game.users.getName("rest-bridge").id` in the
browser console) can go in `FOUNDRY_USER_ID` to skip the name lookup at login.

## 4. Keep a Gamemaster browser connected

The bridge runs no module code. Each request is answered by the designated
active Gamemaster's browser, so **a GM must be logged in through a browser
with the world open** for the API to answer. With no GM connected, requests
time out after `REQUEST_TIMEOUT` milliseconds: 5000 unless set
(`bridge-server/server.js`); the example below sets 10000.

For an always-on API this means a browser session that stays open, for
example on the machine that runs Foundry or the MCP. A browser logged in as
the bridge's own user also counts if that user is a Gamemaster.

## 5. Run the bridge next to Foundry

Run the bridge on the same host or network as Foundry and point it at
Foundry's internal address, so it does not go through the public reverse
proxy. Example `compose.yaml` service, alongside an existing Foundry service
named `foundry` that listens on 30000:

```yaml
services:
  rest-bridge:
    # No published image yet: build bridge-server/ from a release tag.
    build:
      context: https://github.com/laurigates/foundryvtt-local-rest-api.git#vX.Y.Z:bridge-server
    restart: unless-stopped
    depends_on:
      - foundry
    environment:
      FOUNDRY_URL: http://foundry:30000      # internal URL; also sent as the Origin header
      FOUNDRY_USERNAME: rest-bridge
      # FOUNDRY_USER_ID: 0123456789abcdef   # optional, skips the getJoinData lookup
      FOUNDRY_PASSWORD: ${REST_BRIDGE_PASSWORD}
      API_KEY: ${REST_BRIDGE_API_KEY}         # same value as the module's API key
      API_PORT: "3030"
      REQUEST_TIMEOUT: "10000"
      CORS_ORIGIN: "*"                        # narrow this if browsers call the bridge
      LOG_LEVEL: info
    # Bind to loopback; do not publish 3030 on a public interface.
    ports:
      - "127.0.0.1:3030:3030"
```

Put `REST_BRIDGE_PASSWORD` and `REST_BRIDGE_API_KEY` in an env file or secret
store that is not committed. The image has a health check on
`GET /api/status`.

### Reverse proxy

Foundry stays behind its existing reverse proxy; the bridge does not need to
pass through it. Expose the bridge itself only if the API client (for example
the MCP) runs on another machine, and then:

- serve it over TLS on its own hostname or path,
- restrict it by source address or put it behind the proxy's own
  authentication, since the API key is not secret from players (below),
- forward `Authorization` and `x-api-key` headers unchanged.

### v14 notes

- Foundry 14 rejects a POST without a same-origin `Origin` header with HTTP 400.
  The bridge sends `Origin` set to the origin of `FOUNDRY_URL`. Use a URL whose
  host and port are what Foundry sees in the `Host` header: the internal
  `http://foundry:30000`, or the public `https://` URL if you route the bridge
  through the proxy.
- The bridge logs in with the v14 `/join` contract (`action: "join"`, user id,
  password) and must log in as a **world user** of the running world.
- After a Foundry restart, if `/api/status` keeps reporting
  `connected: false`, restart the bridge once Foundry has finished loading the
  world, so it logs in again. Whether its automatic reconnect also repeats the
  login has not been checked live.

## 6. Check it

From the bridge host:

```sh
curl -s http://127.0.0.1:3030/api/status
curl -s -H "x-api-key: $REST_BRIDGE_API_KEY" http://127.0.0.1:3030/api/world
```

`/api/status` needs no key and reports whether the bridge's Foundry socket is
connected. `/api/world` returns `{"success": true, "data": {...}}`
([ADR-0003](adrs/0003-response-contract.md)) when a GM browser is connected,
and times out when none is.

## 7. Configure foundryvtt-mcp for dual mode

Lauri chose dual mode: the MCP keeps its direct Socket.IO connection to
Foundry for world data and writes, and uses this API for what needs a browser
client (derived dnd5e values, compendium search, logs).

| Variable | Value |
|---|---|
| `FOUNDRY_URL` | Foundry's URL, as for Socket.IO mode |
| `FOUNDRY_USERNAME`, `FOUNDRY_PASSWORD` | The MCP's own world user, as today |
| `FOUNDRY_API_KEY` | The module's API key, same as the bridge's `API_KEY` |
| `FOUNDRY_REST_URL` | The bridge's base URL, e.g. `http://127.0.0.1:3030` |

`FOUNDRY_REST_URL` comes from
[foundryvtt-mcp#330](https://github.com/laurigates/foundryvtt-mcp/pull/330)
(its ADR-0011), which is not merged or released yet. With the API key, the
REST URL and Socket.IO credentials set, that change runs in dual mode; with the
key and credentials but no `FOUNDRY_REST_URL`, it stays in the deprecated
REST-only mode and treats `FOUNDRY_URL` as the bridge.

Today's released MCP has one base URL: with `FOUNDRY_API_KEY` set, it sends
its REST-capable calls to `FOUNDRY_URL` (its `client.ts` picks the transport
per call from `apiKey`), so it cannot reach Foundry and the bridge at
different addresses until #330 ships. #330 also maps this API's response
shape (foundryvtt-mcp#310, ADR-0003).

## Security caveats

From #5; read them before exposing the bridge anywhere:

- **Players can read the API key.** It is a world-scope setting, and world
  settings are sent to every client, so anyone in the world can read it from
  the browser console. The module also prints a newly generated key in a
  notification and in `console.log`. Treat the key as known to every player.
- **Rotate the key after setup.** Regenerate it in **API Configuration** once
  the bridge works, with no players connected, then update the bridge's
  `API_KEY` and restart it. The module and the bridge must hold the same key.
  Rotate again whenever the key has been on screen or in a log.
- **A failed bridge login looks like a timeout.** If the bridge's Foundry
  login fails it falls back to an anonymous socket, which receives nothing;
  every request then times out. Check the bridge log for the login result
  first.
- **Dice roll reasons reach chat HTML unescaped** when `sendToChat` is set.
  Do not pass untrusted text as a roll reason.

## Updating

- **Module:** Foundry's **Update** button reads the manifest URL and installs
  the latest release.
- **Bridge:** change the tag in the build context and rebuild
  (`docker compose build rest-bridge && docker compose up -d rest-bridge`).
  Keep the bridge and module on the same release.
