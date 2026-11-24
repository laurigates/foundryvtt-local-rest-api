# FoundryVTT REST API Bridge Server

A Node.js bridge server that creates actual HTTP endpoints and forwards requests to the FoundryVTT Local REST API module via socket.io. This solves the architectural limitation where FoundryVTT modules run in browser context and cannot create HTTP servers directly.

## Architecture

```
External Client → Bridge Server → Socket.io → FoundryVTT Module → Game Data
     (HTTP)         (Node.js)     (WebSocket)    (Browser JS)
```

### Components

1. **Bridge Server** (this directory): Node.js HTTP server with Express endpoints
2. **FoundryVTT Module** (parent directory): Browser module that processes requests via socket.io
3. **Socket.io Communication**: Real-time bidirectional communication between server and module

## Quick Start

### 1. Install Dependencies

```bash
cd bridge-server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:
```env
FOUNDRY_URL=http://localhost:30000
API_KEY=your_foundry_api_key_here
API_PORT=3030
REQUEST_TIMEOUT=5000
```

### 3. Start the Bridge Server

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### 4. Test the Connection

```bash
# Check bridge server status
curl http://localhost:3030/api/status

# Test with authentication
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3030/api/actors
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FOUNDRY_URL` | `http://localhost:30000` | FoundryVTT server URL |
| `API_KEY` | *(required)* | API key from FoundryVTT module |
| `API_PORT` | `3030` | Port for bridge server |
| `REQUEST_TIMEOUT` | `5000` | Timeout for FoundryVTT requests (ms) |
| `CORS_ORIGIN` | `*` | CORS origin policy |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `FOUNDRY_NAMESPACE` | `module.foundryvtt-local-rest-api` | Socket.io namespace |
| `MAX_RETRIES` | `3` | Connection retry attempts |
| `RECONNECT_DELAY` | `1000` | Reconnection delay (ms) |

### Getting the API Key

1. Enable the FoundryVTT Local REST API module in your world
2. Go to Module Settings → FoundryVTT Local REST API → Configuration
3. Copy the generated API key
4. Use it in your `.env` file or pass as environment variable

## API Endpoints

All endpoints require authentication via `x-api-key` header or `Authorization: Bearer <token>`.

### Core Endpoints

- `GET /api/status` - Health check (no auth required)
- `GET /api/actors[?query&type&limit]` - Search actors
- `GET /api/actors/:id` - Get specific actor
- `GET /api/items[?query&type&rarity]` - Search items
- `GET /api/items/:id` - Get specific item
- `POST /api/dice/roll` - Roll dice
- `GET /api/scenes` - List scenes
- `GET /api/scenes/:id` - Get specific scene
- `GET /api/scenes/current` - Get active scene
- `GET /api/world` - Get world information

### Diagnostics Endpoints

- `GET /api/diagnostics/health` - System health
- `GET /api/diagnostics/logs` - Recent logs
- `GET /api/diagnostics/search` - Search logs
- `GET /api/diagnostics/errors` - Error analysis

## Usage Examples

### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3030/api/actors', {
  headers: {
    'x-api-key': 'your-api-key-here'
  }
});
const actors = await response.json();
```

### Python

```python
import requests

response = requests.get(
  'http://localhost:3030/api/actors',
  headers={'x-api-key': 'your-api-key-here'}
)
actors = response.json()
```

### cURL

```bash
curl -H "x-api-key: your-api-key-here" \
  http://localhost:3030/api/actors?type=character&limit=10
```

### Dice Rolling

```bash
curl -X POST \
  -H "x-api-key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"formula":"1d20+5","reason":"Attack roll"}' \
  http://localhost:3030/api/dice/roll
```

## Error Handling

The bridge server provides comprehensive error handling:

- **Connection Errors**: Automatic retry with exponential backoff
- **Timeout Errors**: Configurable request timeouts
- **Authentication Errors**: Proper HTTP status codes
- **FoundryVTT Errors**: Forward specific error messages
- **Network Errors**: Graceful degradation and logging

### Response Format

```javascript
// Success Response
{
  "success": true,
  "data": { /* endpoint-specific data */ }
}

// Error Response
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error description"
}
```

## Production Deployment

### Using PM2

```bash
npm install -g pm2

# Start with PM2
pm2 start server.js --name foundry-bridge

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker (Standalone)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3030
CMD ["npm", "start"]
```

### Using Docker Compose (Recommended)

The bridge server is included in the main FoundryVTT Docker Compose setup. From the project root:

```bash
# Start both FoundryVTT and bridge server
docker compose up -d

# Start only FoundryVTT (without bridge server)  
docker compose up -d fvtt

# View logs
docker compose logs bridge-server
docker compose logs fvtt
```

**Docker Compose Configuration:**
```yaml
services:
  fvtt:
    # FoundryVTT server configuration
    ports:
      - 30000:30000
    networks:
      - foundry-net

  bridge-server:
    build:
      context: ./data/Data/modules/foundryvtt-local-rest-api/bridge-server
      dockerfile: Dockerfile
    environment:
      - FOUNDRY_URL=http://fvtt:30000  # Internal container networking
      - API_PORT=3030
      - REQUEST_TIMEOUT=10000
      - LOG_LEVEL=info
    ports:
      - 3030:3030
    depends_on:
      - fvtt
    networks:
      - foundry-net
```

**Key Features:**
- **Automatic Networking**: Bridge server connects to FoundryVTT via internal Docker network
- **No Manual Configuration**: Pre-configured environment variables
- **Health Monitoring**: Built-in health checks and logging
- **Persistent Data**: Volume mounts for configuration persistence
- **Security**: Runs as non-root user with minimal permissions

### Environment Configuration

```bash
# Production environment
NODE_ENV=production
API_PORT=3030
FOUNDRY_URL=http://your-foundry-server:30000
API_KEY=your-production-api-key
LOG_LEVEL=warn
```

## Security Considerations

- **API Key Protection**: Store securely, never commit to version control
- **CORS Configuration**: Restrict origins in production
- **Helmet Security**: Enabled by default with security headers
- **Request Rate Limiting**: Consider adding rate limiting for production
- **Network Security**: Run on internal network or behind reverse proxy

## Monitoring and Logging

### Health Monitoring

```bash
# Check server health
curl http://localhost:3030/api/status

# Response includes connection status, uptime, and pending requests
```

### Logging

- **info**: Standard operational logs
- **debug**: Detailed request/response logging
- **warn**: Warnings and recoverable errors
- **error**: Critical errors and exceptions

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Verify FoundryVTT is running and accessible
   - Check `FOUNDRY_URL` in environment configuration
   - Ensure no firewall blocking the connection

2. **401 Unauthorized**
   - Verify API key is correct and current
   - Check API key format in request headers
   - Ensure FoundryVTT module is enabled

3. **504 Gateway Timeout**
   - Increase `REQUEST_TIMEOUT` value
   - Check FoundryVTT module is responding
   - Verify socket.io namespace configuration

4. **Socket Connection Issues**
   - Check FoundryVTT WebSocket is enabled
   - Verify no proxy interfering with WebSocket
   - Try increasing `RECONNECT_DELAY`

### Debug Mode

Enable debug logging to see detailed request flows:

```bash
LOG_LEVEL=debug npm start
```

## Development

### Project Structure

```
bridge-server/
├── server.js              # Main Express server
├── lib/
│   ├── socket-client.js    # Socket.io client management
│   └── auth.js             # Authentication middleware
├── routes/
│   ├── actors.js           # Actor endpoints
│   ├── items.js            # Item endpoints
│   ├── dice.js             # Dice rolling endpoints
│   ├── scenes.js           # Scene endpoints
│   ├── world.js            # World information endpoints
│   └── diagnostics.js      # Diagnostics endpoints
├── package.json            # Node.js dependencies
├── .env.example            # Environment template
└── README.md               # This file
```

### Adding New Endpoints

1. Create route handler in `routes/` directory
2. Import and register in `server.js`
3. Update documentation and examples

### Testing

```bash
# Start test server
npm run dev

# Test specific endpoints
curl -H "x-api-key: test-key" http://localhost:3030/api/actors
```

## Integration

This bridge server is designed to work with:

- **FoundryVTT MCP Server**: Replace third-party REST module dependency
- **External Applications**: Provide standard REST API access
- **CI/CD Pipelines**: Automate FoundryVTT data operations
- **Monitoring Systems**: Health checks and diagnostics

## License

MIT License - see parent directory LICENSE file for details.