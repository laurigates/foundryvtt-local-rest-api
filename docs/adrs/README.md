# Architecture Decision Records

| ADR | Title | Status | Domain |
|-----|-------|--------|--------|
| [0001](0001-module-plus-node-bridge.md) | A Foundry module plus a Node bridge server | Accepted | architecture |
| [0002](0002-v14-port-and-verified-compatibility.md) | Port to v14, and raise `compatibility.verified` only after a live run | Accepted | compatibility |
| [0003](0003-response-contract.md) | The `{success, data}` response contract, mapped by the client | Accepted | api-design |
| [0004](0004-one-socket-event-one-answering-gm.md) | One socket event, one answering Gamemaster, a logged-in bridge | Accepted | architecture |
| [0005](0005-shared-world-api-key.md) | One world-scope API key, validated by the module | Accepted | authentication |

ADRs use the frontmatter fields `date`, `status`, `domain`, and optionally
`supersedes`, `superseded-by`, `extends` and `related`. Numbering starts at
0001 in this repository; the module's earlier history inside foundryvtt-mcp is
summarised in ADR-0001.
