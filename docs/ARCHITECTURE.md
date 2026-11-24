# Architecture Documentation

This document provides detailed technical information about the Foundry Local REST API architecture, explaining why a two-component design was necessary and how the components interact.

## The Problem: Browser Security Limitations

FoundryVTT modules run in a browser JavaScript environment, which has fundamental security limitations:

- **No HTTP Server Creation**: Browser JavaScript cannot create HTTP servers
- **Same-Origin Policy**: Restricts cross-origin requests
- **No File System Access**: Limited access to system resources
- **Sandboxed Environment**: Cannot open network sockets directly

Previous attempts to create REST APIs from FoundryVTT modules were fundamentally impossible due to these browser security constraints.

## The Solution: Two-Component Architecture

Our solution separates concerns into two cooperating components:

### Component 1: FoundryVTT Module (Browser Context)
- **Purpose**: Secure data access and authentication
- **Environment**: Browser JavaScript (ES6 modules)
- **Responsibilities**:
  - API key generation and validation
  - Direct access to FoundryVTT game data
  - Socket.io server for WebSocket communication
  - Request authentication and authorization
  - Data formatting and response creation

### Component 2: Bridge Server (Node.js Context)
- **Purpose**: HTTP endpoint provision and request routing
- **Environment**: Node.js server application
- **Responsibilities**:
  - Express.js HTTP server with REST endpoints
  - Socket.io client for FoundryVTT communication
  - Request validation and authentication forwarding
  - HTTP response formatting and error handling
  - Connection management and retry logic

## Communication Flow

```
┌─────────────────┐    HTTP     ┌─────────────────┐   Socket.io   ┌──────────────────────┐
│ External Client │ ──────────> │ Bridge Server   │ ────────────> │ FoundryVTT Module    │
│  (Your App)     │ <────────── │   (Node.js)     │ <──────────── │   (Browser JS)       │
└─────────────────┘   REST API   └─────────────────┘   WebSocket   └──────────────────────┘
                                                                              │
                                                                              v
                                                                    ┌──────────────────────┐
                                                                    │ FoundryVTT Game Data │
                                                                    └──────────────────────┘
```

### Request Flow Example

1. **Client Request**: External app sends HTTP request to bridge server
2. **Authentication**: Bridge server validates API key and request format
3. **Socket Message**: Bridge server sends structured message to FoundryVTT module via Socket.io
4. **Module Processing**: FoundryVTT module authenticates request and processes data
5. **Data Access**: Module accesses FoundryVTT's native collections and APIs
6. **Response Creation**: Module formats response data and sends back via Socket.io
7. **HTTP Response**: Bridge server receives response and sends HTTP response to client

## Technical Implementation Details

### Socket.io Message Protocol

Messages between bridge server and FoundryVTT module follow this structure:

```javascript
// Request Message
{
  type: "actors.search",        // Category.action format
  requestId: "uuid-v4",         // Unique request identifier
  auth: {
    apiKey: "api-key-here"      // Authentication credential
  },
  params: {
    query: {...},               // Query parameters
    params: {...}               // Route parameters
  },
  body: {...}                   // Request body (for POST requests)
}

// Response Message
{
  requestId: "uuid-v4",         // Matching request identifier
  success: true,                // Success/failure indicator
  data: {...}                   // Response data (success)
  error: "Error Type",          // Error type (failure)
  message: "Error description"  // Error message (failure)
}
```

### Authentication Flow

1. **API Key Generation**: FoundryVTT module generates cryptographically secure 256-bit API key
2. **Key Storage**: API key stored in FoundryVTT world settings
3. **Bridge Configuration**: User configures bridge server with same API key
4. **Request Authentication**: Bridge server validates API key in HTTP headers
5. **Socket Authentication**: FoundryVTT module re-validates API key for security
6. **Constant-Time Comparison**: Both components use timing-attack-resistant key validation

### Error Handling Strategy

#### Bridge Server Errors
- **Connection Errors**: Automatic retry with exponential backoff
- **Timeout Errors**: Configurable request timeouts with graceful failure
- **Authentication Errors**: Immediate HTTP 401 response
- **Validation Errors**: HTTP 400 with detailed error messages

#### FoundryVTT Module Errors
- **Data Access Errors**: Caught and returned as structured error responses
- **Authentication Failures**: Logged and returned as 401 responses
- **Processing Errors**: Wrapped in consistent error format

#### Error Response Format
```javascript
{
  success: false,
  error: "Error Category",      // Technical error type
  message: "User-friendly description",
  timestamp: "ISO-8601-timestamp",
  requestId: "uuid-v4"          // For request tracing
}
```

## Security Considerations

### API Key Security
- **Generation**: Cryptographically secure random bytes (256-bit)
- **Storage**: World-level settings in FoundryVTT (encrypted at rest)
- **Transmission**: HTTPS recommended for production
- **Validation**: Constant-time comparison prevents timing attacks
- **Rotation**: Manual rotation through FoundryVTT module settings

### Network Security
- **Local-Only**: Designed for local network operation
- **No External Dependencies**: No third-party services or data transmission
- **CORS Configuration**: Configurable origin restrictions
- **Request Logging**: Optional for security monitoring
- **Rate Limiting**: Recommended for production deployments

### Communication Security
- **WebSocket Security**: Socket.io provides connection encryption
- **Message Validation**: All messages validated before processing
- **Request Isolation**: Each request processed independently
- **Error Privacy**: No sensitive data exposed in error messages

## Performance Characteristics

### Latency Profile
- **HTTP Overhead**: Standard Express.js request handling (~1-2ms)
- **WebSocket Communication**: Socket.io message passing (~1-5ms)
- **Data Access**: Direct FoundryVTT collection access (~1-10ms)
- **Total Round-Trip**: Typically 5-20ms for simple queries

### Throughput Considerations
- **Concurrent Requests**: Limited by FoundryVTT's single-threaded nature
- **Connection Pooling**: Socket.io handles connection management
- **Memory Usage**: Minimal - no data caching or persistence
- **Scaling**: Horizontal scaling not applicable (single FoundryVTT instance)

### Resource Usage
- **Bridge Server**: ~10-50MB RAM, minimal CPU
- **FoundryVTT Module**: ~1-5MB additional RAM, minimal CPU
- **Network**: Low bandwidth requirements (JSON messages)

## Deployment Patterns

### Development Setup
```bash
# Terminal 1: Start FoundryVTT
./foundryvtt --port=30000

# Terminal 2: Start bridge server
cd bridge-server
npm run dev
```

### Production Deployment
```yaml
# docker-compose.yml
version: '3.8'
services:
  foundry:
    image: foundryvtt/foundry:release
    ports:
      - "30000:30000"
    volumes:
      - foundry_data:/data

  bridge:
    build: ./bridge-server
    ports:
      - "3030:3030"
    environment:
      - FOUNDRY_URL=http://foundry:30000
      - API_KEY=${FOUNDRY_API_KEY}
    depends_on:
      - foundry

volumes:
  foundry_data:
```

### Load Balancer Configuration
```nginx
# nginx.conf
upstream foundry_api {
    server localhost:3030;
}

server {
    listen 80;
    server_name api.your-foundry.com;

    location /api/ {
        proxy_pass http://foundry_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring and Observability

### Health Checks
```bash
# Bridge server health
curl http://localhost:3030/api/status

# Component connectivity
curl http://localhost:3030/api/diagnostics/health
```

### Logging Strategy
- **Bridge Server**: Structured JSON logs with request tracing
- **FoundryVTT Module**: Browser console logs for debugging
- **Log Levels**: debug, info, warn, error with configurable verbosity
- **Request Tracing**: UUID-based request correlation

### Metrics Collection
```javascript
// Example metrics to monitor
{
  requests_total: 1547,
  requests_per_second: 12.3,
  response_time_avg: 15.2,
  response_time_p95: 45.1,
  errors_total: 3,
  error_rate: 0.19,
  connection_status: "connected",
  uptime_seconds: 86400
}
```

## Extension Points

### Adding New Endpoints

1. **Create Route Handler** (FoundryVTT module):
```javascript
// scripts/routes/custom.js
export class CustomAPI {
  async customMethod(req, res) {
    // Implementation
  }
}
```

2. **Register Handler** (FoundryVTT module):
```javascript
// scripts/socket-handler.js
this.handlers.custom = new CustomAPI();
```

3. **Add HTTP Route** (Bridge server):
```javascript
// bridge-server/routes/custom.js
router.get('/custom', async (req, res) => {
  const response = await socketClient.sendMessage({
    type: 'custom.method',
    // ...
  });
  res.json(response);
});
```

### Custom Authentication
```javascript
// bridge-server/lib/auth.js
export function customAuthMiddleware(req, res, next) {
  // Custom authentication logic
  next();
}
```

### Response Transformation
```javascript
// bridge-server/lib/transform.js
export function transformResponse(data, endpoint) {
  // Custom response transformation
  return transformedData;
}
```

## Comparison with Alternatives

### vs. Direct Module HTTP Server
- **Impossible**: Browser security prevents HTTP server creation
- **Our Solution**: Uses legitimate WebSocket communication

### vs. Third-Party Relay Services
- **Privacy**: No external data transmission vs. data leaves your network
- **Reliability**: No external dependencies vs. service availability risks
- **Cost**: Free forever vs. potential service fees
- **Control**: Full ownership vs. vendor dependency

### vs. FoundryVTT Built-in API
- **Scope**: Limited built-in API vs. comprehensive game data access
- **Flexibility**: Fixed endpoints vs. customizable routes
- **Integration**: Complex authentication vs. standard HTTP headers

## Future Architecture Considerations

### WebSocket Endpoint Support
- Direct WebSocket endpoints for real-time updates
- Event streaming for game state changes
- Subscription-based data feeds

### Microservices Architecture
- Separate services for different data types
- Independent scaling of components
- Service mesh integration

### GraphQL Support
- Single endpoint with flexible queries
- Reduced over-fetching of data
- Type-safe query interface

### Caching Layer
- Redis integration for response caching
- Cache invalidation on game state changes
- Performance optimization for repeated queries

This architecture provides a robust, secure, and extensible foundation for local REST API access to FoundryVTT data while respecting browser security constraints and maintaining high performance.