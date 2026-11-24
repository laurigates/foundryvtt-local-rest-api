# Solution: Fixing the FoundryVTT Local REST API

## The Problem

The current architecture has a fundamental flaw:

1. **Bridge Server**: Connects to FoundryVTT's Socket.io server as an external client
2. **FoundryVTT Module**: Listens for messages on `game.socket`
3. **Issue**: `game.socket` is for browser-to-browser communication only. External Socket.io clients cannot send messages through `game.socket`

## Why This Doesn't Work

- `game.socket` is a FoundryVTT abstraction for browser clients only
- External Socket.io connections cannot participate in `game.socket` messaging
- The bridge server successfully connects but its messages never reach the module

## The Solution

We need to modify the architecture to use a different communication method:

### Option 1: HTTP Long Polling (Recommended)
Instead of Socket.io, use HTTP long polling:
1. Module stores pending requests in a queue
2. Bridge server polls the module for new requests via a special endpoint
3. Module processes requests and returns responses
4. Bridge server sends HTTP response to original client

### Option 2: Custom WebSocket Protocol
Create a custom WebSocket server outside of `game.socket`:
1. Module creates a WebSocket endpoint using a different mechanism
2. Bridge server connects via standard WebSocket protocol
3. Direct bidirectional communication without `game.socket`

### Option 3: Browser Client Relay
Use a browser client as a relay:
1. Create a minimal browser client that connects to FoundryVTT
2. This client listens on `game.socket` and relays to bridge server
3. Bridge server communicates with the relay client

### Option 4: FoundryVTT Native API (Limited)
Use FoundryVTT's built-in `/api/status` endpoint pattern:
1. FoundryVTT v13 has some built-in API endpoints
2. Extend these with custom handlers (if possible)
3. Limited by what FoundryVTT exposes

## Immediate Workaround

For testing purposes, you can:

1. Open FoundryVTT in a browser
2. Enable the module and configure the API key
3. Open browser console and manually emit socket events:
```javascript
game.socket.emit('module.foundryvtt-local-rest-api', {
  type: 'actors.search',
  requestId: 'test-1',
  auth: { apiKey: 'your-api-key' },
  params: { query: {} }
});
```

## Recommended Fix

The most reliable solution is to implement HTTP long polling:

1. Module maintains a request queue
2. Bridge server polls every 100ms for new work
3. Module processes requests using FoundryVTT data
4. Responses sent back via the polling connection

This avoids the Socket.io complexity and works reliably.