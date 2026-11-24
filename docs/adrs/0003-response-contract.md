---
date: 2026-11-24
status: Accepted
domain: api-design
related:
  - ADR-0001
---

# ADR-0003: The `{success, data}` response contract, mapped by the client

## Context

Every route handler in `scripts/routes/` answers with

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Error Type", "message": "Detail" }
```

and search routes add fields beside `data` (`total`, `query`). The
`SocketMessageHandler` wraps that payload in a socket envelope
(`{requestId, success, data: <payload>, result: <payload>, timestamp}`), and the
bridge returns the payload as the HTTP body. So an HTTP client sees the route's
object unchanged.

foundryvtt-mcp's REST client was written without checking this shape. It reads
fields at the top level of the body, `_id` instead of `id`, `hp.value` instead
of `hp.current`, `ac.value` instead of a number, and `actors`/`page` instead of
`data`/`total` (foundryvtt-mcp#310 has the full table, read from #4's code).
The two sides disagree on every route.

Either side could change. The module's shape is what its own tests, docs and
the bridge's e2e suite assert, and other HTTP clients may already read it.

## Decision

- The module keeps the `{success, data}` contract and its field names
  (`id`, `hp: {current, max}`, `ac` as a number, `{success, data, total,
  query}` for searches). Error responses keep `error` (a type) and `message`
  (the detail); validation failures use `error: "Validation Error"`.
- **The MCP maps the response**, unwrapping `data` and mapping each route
  explicitly, with a contract test built from the module's actual output
  (foundryvtt-mcp#310).
- A change to a field name or to the envelope is a breaking change of this
  API and goes out as a major release.

## Consequences

- No module change is needed for the MCP fix; foundryvtt-mcp#310 carries it.
- The module's fields are its public API. dnd5e-specific fields (abilities,
  skills, spells) follow the module's names, not dnd5e's data paths.
- The socket envelope's duplicate `result`/`data` fields (added for an earlier
  bridge, see `docs/FIX_SUMMARY.md`) are internal to module and bridge, not
  part of the HTTP contract.
