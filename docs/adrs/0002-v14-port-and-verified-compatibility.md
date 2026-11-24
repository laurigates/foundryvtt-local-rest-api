---
date: 2026-11-24
status: Accepted
domain: compatibility
related:
  - ADR-0001
  - ADR-0004
---

# ADR-0002: Port to v14, and raise `compatibility.verified` only after a live run

## Context

Production and the harness moved to Foundry 14.369 (felddy 14.369.1) with
dnd5e 6.0.6 on 2026-11-23. The module was written against v13 and dnd5e
4/5, and several of the APIs it used are gone or deprecated in v14: the dice
term globals (`Die`, `NumericTerm`, `OperatorTerm`), `CONST.CHAT_MESSAGE_TYPES`,
`Roll#evaluate({async})`, `scene.img`, the AppV1 `FormApplication` settings
menu, and the `/join` login contract the bridge used (#4 lists each change
with its reference).

A module manifest carries two claims: `compatibility.maximum` (the newest
generation Foundry should allow it to load on) and `compatibility.verified`
(the newest build it is known to work on). Foundry warns about, but loads, a
module whose `verified` is older than the running build.

The v14 port (#4) was checked against the 14.369 build's shipped source, the
dnd5e 6.0.6 bundle and unit tests. It has not yet run on a live v14 server:
live harness access for agents waits on a permission rule Lauri is adding.

## Decision

1. Port the module and bridge to v14 in one change (#4): `foundry.dice.terms`,
   `Roll#toMessage`, `HandlebarsApplicationMixin(ApplicationV2)` for the
   settings menu, `Scene#initialLevel` with v13 fallbacks, dnd5e 6 data paths,
   and the v14 `/join` contract (`Origin` header on every POST, `action: "join"`,
   user id resolution).
2. Set `compatibility.minimum` 13 and `compatibility.maximum` 14.
3. **Keep `compatibility.verified` at 13** until the module has run on a v14
   server and the live checklist in #4 passes (bridge login, module load,
   settings menu, each read route answered by exactly one client). Then raise
   it to the build that was run, e.g. `14.369`.

The rule generalises: `verified` names a build the module has run on, never
a build it was only read against.

## Consequences

- Foundry shows a "not verified" warning on v14 until the live run; the module
  still loads.
- The release workflow does not change `verified`; it is edited in
  `module.json.template` as a normal commit after the live run.
- dnd5e 6 moved much item data onto activities. `ItemsAPI.formatItemDetail`
  and the scene/world formatters still read pre-dnd5e-4 and v11 fields; #5
  tracks those.
- v13 fallbacks stay in the code while `minimum` is 13.
