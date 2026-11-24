# Security Policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/laurigates/foundryvtt-local-rest-api/security/advisories/new).
Do not open a public issue for a security problem.

Include the affected version, the component (FoundryVTT module or bridge
server), and steps to reproduce. Expect an acknowledgement within a week.

## Scope

The module and bridge server are designed for use on a trusted local network.
API-key authentication is shared per world (see ADR-0005 in `docs/adrs/`).
Exposing the bridge server to the public internet is outside the supported
configuration.
