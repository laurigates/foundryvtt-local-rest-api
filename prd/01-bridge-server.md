# Bridge Server Requirements

## Purpose
HTTP server that bridges external REST requests to FoundryVTT via Socket.io

## Core Requirements

### HTTP Server
- **Port**: 3030 (configurable via PORT env var)
- **Framework**: Express.js
- **CORS**: Enabled for local integrations
- **Security**: Helmet for headers

### Socket.io Client
- **Connection**: To FoundryVTT module on port 30000
- **Reconnection**: Automatic with exponential backoff
- **Timeout**: 10 second response timeout
- **Error Handling**: Graceful degradation on disconnect

### Authentication
- **Method**: Forward API key to module for validation
- **Headers**: Support both `x-api-key` and `Authorization: Bearer`
- **No Storage**: Bridge never stores keys

### Endpoints (All proxy to module)
- `GET /api/status` - Health check (no auth)
- `GET /api/actors[?query&type&limit]`
- `GET /api/actors/:id`
- `POST /api/actors/:id/update`
- `GET /api/items[?query&type&rarity]`
- `GET /api/scenes[?query]`
- `GET /api/scenes/current`
- `POST /api/dice/roll`
- `GET /api/world`

### Response Format
```json
{
  "success": true|false,
  "data": {},
  "error": "string",
  "message": "string"
}
```

### Deployment
- **Standalone**: `node server.js`
- **Development**: `npm run dev` with nodemon
- **Production**: PM2 or systemd service

## Testing Requirements
- Unit tests for auth and routing
- Integration tests with mock socket
- Load testing for concurrent requests