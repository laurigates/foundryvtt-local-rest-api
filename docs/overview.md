# Overview

Architecture overview and the privacy model.

## Architecture

This solution consists of two components that work together:

```
┌─────────────────┐    HTTP     ┌─────────────────┐   Socket.io   ┌──────────────────────┐
│ External Client │ ──────────> │ Bridge Server   │ ──────────>   │ FoundryVTT Module    │
│  (Your App)     │ <────────── │   (Node.js)     │ <──────────   │   (Browser JS)       │
└─────────────────┘   REST API   └─────────────────┘   WebSocket   └──────────────────────┘
                                                                              │
                                                                              v
                                                                    ┌──────────────────────┐
                                                                    │ FoundryVTT Game Data │
                                                                    └──────────────────────┘
```

1. **FoundryVTT Module**: Runs in FoundryVTT's browser context, handles authentication and data access
2. **Bridge Server**: Node.js HTTP server that provides REST endpoints and forwards requests via Socket.io

**Why Two Components?** FoundryVTT modules run in browser JavaScript environment, which cannot create HTTP servers directly. The bridge server provides the HTTP interface while the module provides secure access to game data.


## Privacy & Security

- **100% Local** - No external dependencies or third-party services
- **No Data Leaves Your Network** - All API calls stay within your local environment
- **Secure API Key Authentication** - Cryptographically secure local authentication
- **Full Control** - You own and control all your game data
