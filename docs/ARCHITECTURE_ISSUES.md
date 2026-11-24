# FoundryVTT Local REST API - Architecture Issues Analysis

## Fundamental Problem

The current implementation has a **critical architectural misunderstanding** about how FoundryVTT works:

### Client-Side vs Server-Side Execution

1. **FoundryVTT modules run in the browser** (client-side)
   - Modules are loaded via `esmodules` in `module.json`
   - They execute in the GM's browser context
   - They have access to the FoundryVTT client API (`game`, `ui`, `Hooks`, etc.)

2. **The attempted implementation tries to:**
   - Access `game.socket.socket.io.httpServer` (line 175 in rest-api.js)
   - Use `express.json()` middleware (line 210)
   - Register HTTP routes on the server

3. **Why this is impossible:**
   - Browser JavaScript **cannot** modify the Node.js HTTP server
   - `express` is not available in the browser context
   - `game.socket.socket.io` is the client-side socket.io connection, not the server
   - The `httpServer` property doesn't exist on the client socket

## What Actually Happens

When the module tries to start:
1. Line 175: `const app = game.socket.socket.io.httpServer;` returns `undefined`
2. Line 178: The error check catches this and throws "Cannot access FoundryVTT HTTP server"
3. The API endpoints are never actually registered anywhere
4. External requests to `/api/*` endpoints return 404 because they don't exist on the server

## Why Some Tests Pass

The `/api/status` endpoint appears to work in some tests because:
- The test configuration uses mocks when `useRestModule` is disabled
- The module never actually creates real HTTP endpoints
- Any "successful" connections are either mocked or hitting different endpoints

## Correct Approaches for a REST API

### Option 1: Server-Side Module (Recommended)
Create a proper server-side module that runs in Node.js:

```javascript
// In the FoundryVTT server's module directory
// This would require access to the server filesystem and custom server code
```

**Limitations:**
- Requires server access
- Not distributable via standard module system
- Requires manual server-side installation

### Option 2: Socket.io Bridge Pattern
Use the existing WebSocket connection to bridge requests:

```javascript
// Client-side module receives data requests via socket
Hooks.on("ready", () => {
  game.socket.on("module.foundryvtt-local-rest-api", (request) => {
    // Process request and send response via socket
    const response = processApiRequest(request);
    game.socket.emit("module.foundryvtt-local-rest-api.response", response);
  });
});
```

**Then create a separate local bridge server:**
```javascript
// Separate Node.js application running locally
const express = require('express');
const io = require('socket.io-client');

const app = express();
const socket = io('http://localhost:30000');

app.get('/api/actors', (req, res) => {
  socket.emit('module.foundryvtt-local-rest-api', { 
    type: 'getActors',
    auth: req.headers['x-api-key']
  });
  
  socket.once('module.foundryvtt-local-rest-api.response', (data) => {
    res.json(data);
  });
});
```

### Option 3: Browser Extension Pattern
Create a browser extension that can intercept and handle HTTP requests:
- Extension has elevated privileges
- Can create local server or intercept requests
- Still requires separate installation

### Option 4: Service Worker Pattern (Limited)
Register a service worker to intercept fetch requests:
- Only works for same-origin requests
- Cannot create true REST endpoints
- Limited browser support and security restrictions

## Recommended Solution

The most practical approach is **Option 2 (Socket.io Bridge)** with two components:

1. **FoundryVTT Module** (this repository)
   - Handles socket.io communication
   - Processes data requests
   - Manages authentication
   - Returns data via socket

2. **Local Bridge Server** (separate Node.js app)
   - Creates actual HTTP endpoints
   - Forwards requests to FoundryVTT via socket.io
   - Returns responses as REST API

This maintains the "local-only" goal while working within FoundryVTT's architecture.

## Current Code Issues

1. **Line 175-180**: Cannot access server from client
2. **Line 210**: `express` is undefined in browser
3. **Line 211-256**: Route registration has no effect
4. **Line 141**: Port detection works but misleading

## Next Steps

1. Remove impossible server modification attempts
2. Implement socket.io message handling
3. Create separate bridge server project
4. Update documentation to explain architecture
5. Add clear installation instructions for both components