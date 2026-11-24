# CLAUDE.md

A **purely local** REST API solution for FoundryVTT that provides HTTP endpoints for external integrations without relying on third-party relay services. This two-component system enables secure, local-only access to actors, items, scenes, dice rolling, and world data.

## Project Overview

**Type**: FoundryVTT Module + Node.js Bridge Server  
**Purpose**: Local REST API server for FoundryVTT game data  
**License**: MIT  
**Node Version**: >=16.0.0  
**FoundryVTT Compatibility**: v13-v14 (verified on v13; see module.json.template)  

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

### Project Structure
```
foundryvtt-local-rest-api/
├── module.json              # Generated from template
├── module.json.template     # Source template with placeholders  
├── package.json             # Node.js project metadata
├── scripts/                 # FoundryVTT Module (Browser Context)
│   ├── rest-api.js          # Main module entry point
│   ├── auth.js              # API key authentication system
│   ├── build.js             # Template processing & build logic
│   ├── socket-handler.js    # Socket.io message handler
│   └── routes/              # API endpoint handlers (for socket messages)
│       ├── actors.js        # Actor CRUD operations
│       ├── items.js         # Item search & retrieval
│       ├── dice.js          # Dice rolling API
│       ├── scenes.js        # Scene data access
│       ├── world.js         # World information
│       └── diagnostics.js   # Status & health checks
├── bridge-server/           # Node.js Bridge Server (HTTP Context)
│   ├── server.js            # Express HTTP server
│   ├── lib/
│   │   ├── socket-client.js # Socket.io client for FoundryVTT communication
│   │   └── auth.js          # Request authentication
│   └── routes/              # HTTP route handlers
│       ├── actors.js        # Actor endpoints
│       ├── items.js         # Item endpoints
│       ├── dice.js          # Dice endpoints
│       ├── scenes.js        # Scene endpoints
│       ├── world.js         # World endpoints
│       └── diagnostics.js   # Diagnostic endpoints
├── lang/
│   └── en.json              # Localization strings
└── templates/
    └── api-config.hbs       # UI configuration template
```

### Key Components

**FoundryVTT Module** (`scripts/`):
- ES6 module initialization and FoundryVTT lifecycle hooks
- API key generation and authentication
- Socket.io server for WebSocket communication with bridge
- Direct access to FoundryVTT game data (actors, items, scenes, etc.)
- Message routing and response handling

**Bridge Server** (`bridge-server/`):
- Express.js HTTP server providing REST endpoints
- Socket.io client connecting to FoundryVTT module
- Request validation and authentication forwarding
- HTTP response formatting and error handling
- Port 3030 (configurable) for external API access

**Why Two Components?** FoundryVTT modules run in browser JavaScript environment, which cannot create HTTP servers directly due to security limitations. The bridge server provides the HTTP interface while the module provides secure access to game data.

## Development Workflow

### Essential Commands

**Module Development:**
```bash
npm run build                    # Generate module.json from template
npm test                         # Run module tests
```

**Bridge Server Development:**
```bash
cd bridge-server
npm install                      # Install bridge server dependencies  
npm start                        # Start bridge server (production)
npm run dev                      # Start bridge server with file watching
npm test                         # Run bridge server tests
npm run test:coverage            # Run tests with coverage report
```

**Distribution:**
```bash
zip -r foundryvtt-local-rest-api.zip . -x "*.git*" "node_modules/*" "bridge-server/node_modules/*" "*.DS_Store*" "module.json.template"
```

### Build Process
1. **Module Template Processing**: `scripts/build.js` processes `module.json.template`
   - Replaces `{{MODULE_VERSION}}` with package.json version
   - Replaces `{{GITHUB_REPOSITORY}}` with git remote info
   - Replaces `{{AUTHOR_NAME}}` and `{{AUTHOR_EMAIL}}` with git config
2. **Module Generation**: Creates final `module.json` with resolved values
3. **Bridge Server**: Independent Node.js application with own package.json
4. **Packaging**: GitHub Actions creates zip and uploads to releases

### Release Pipeline
- **Trigger**: Git tags matching `v*.*.*` pattern
- **Platform**: Ubuntu latest with Node.js 18
- **Steps**:
  1. Checkout code
  2. Install module dependencies (`npm ci`)
  3. Install bridge server dependencies (`cd bridge-server && npm ci`)
  4. Run tests for both components
  5. Generate module.json (`npm run build`)
  6. Create distribution zip including both components
  7. Upload to GitHub releases

## API Endpoints

### Core Endpoints
- **GET** `/api/status` - Health check (no auth required)
- **POST** `/api/dice/roll` - Roll dice with FoundryVTT's system
- **GET** `/api/actors[?query&type&limit]` - Search/retrieve actors
- **GET** `/api/actors/:id` - Get specific actor details
- **GET** `/api/items[?query&type&rarity]` - Search items/equipment
- **GET** `/api/scenes[?query]` - Access scene data
- **GET** `/api/scenes/current` - Get active scene
- **GET** `/api/world` - World info, statistics, combat state

### Authentication
- **Header Method**: `x-api-key: YOUR_API_KEY`
- **Bearer Token**: `Authorization: Bearer YOUR_API_KEY`
- **API Key**: Auto-generated 256-bit cryptographically secure key

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

## Security & Privacy Features

### Local-First Design
- **100% Local**: No external dependencies or third-party services
- **Privacy**: No data leaves your network
- **Control**: Full ownership of game data
- **Reliability**: No external service dependencies

### Security Measures
- **Cryptographic API Keys**: 256-bit secure random generation
- **Timing Attack Prevention**: Constant-time key comparison
- **Input Validation**: Comprehensive request validation
- **Error Handling**: No sensitive data exposure in errors
- **Request Logging**: Optional debugging with privacy controls

## Configuration

### Module Settings (World-level)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Enable REST API** | Boolean | `false` | Turn API server on/off |
| **API Key** | String | _(generated)_ | Authentication key |
| **Log API Requests** | Boolean | `false` | Debug request logging |

### Environment Variables (Build-time)
- `GITHUB_USERNAME` - Override git config username
- `GITHUB_REPOSITORY` - Override git remote repository
- `MODULE_VERSION` - Override package.json version
- `AUTHOR_NAME` - Override git config user.name
- `AUTHOR_EMAIL` - Override git config user.email

## Integration Examples

### FoundryVTT MCP Server Integration
Update your MCP server's `.env` to use the bridge server:
```env
FOUNDRY_URL=http://localhost:3030
FOUNDRY_API_KEY=your_local_api_key_here
USE_REST_MODULE=false  # Use local bridge server instead of third-party module
```

### JavaScript/Node.js
```javascript
const response = await fetch('http://localhost:3030/api/actors', {
  headers: { 'x-api-key': 'YOUR_API_KEY' }
});
const actors = await response.json();
```

### Python
```python
import requests
response = requests.get(
  'http://localhost:3030/api/actors',
  headers={'x-api-key': 'YOUR_API_KEY'}
)
actors = response.json()
```

## Files & Directories

### Key Files

**FoundryVTT Module:**
- `module.json.template` - Source manifest with build-time placeholders
- `scripts/rest-api.js` - Module entry point and Socket.io server
- `scripts/socket-handler.js` - Socket message routing and response handling
- `scripts/auth.js` - Security and authentication logic
- `scripts/build.js` - Template processing and dynamic value injection
- `lang/en.json` - UI localization strings

**Bridge Server:**
- `bridge-server/server.js` - Express HTTP server entry point
- `bridge-server/lib/socket-client.js` - Socket.io client for FoundryVTT communication
- `bridge-server/lib/auth.js` - HTTP request authentication
- `bridge-server/routes/*.js` - HTTP route handlers

**Build & CI:**
- `.github/workflows/test.yml` - CI/CD pipeline with tests
- `jest.config.js` - Test configuration (both components)

### Generated/Ignored Files
- `module.json` - Generated by build process, not committed
- `*.zip` - Distribution packages
- `node_modules/` - Dependencies (both root and bridge-server)

## Dependencies & Compatibility

### Runtime Dependencies

**FoundryVTT Module:**
- **FoundryVTT**: v13-v14 (`compatibility.verified` stays 13 until the module has run on v14)
- **Browser**: Modern ES6+ support with Socket.io
- **No External Libraries**: Pure JavaScript implementation

**Bridge Server:**
- **Node.js**: >=16.0.0 runtime environment
- **Express**: HTTP server framework
- **Socket.io-client**: WebSocket communication with FoundryVTT
- **CORS**: Cross-origin request handling
- **Helmet**: Security headers
- **dotenv**: Environment variable management

### Development Dependencies  
- **Node.js**: >=16.0.0 for development and build process
- **Jest**: Test framework (both components)
- **Supertest**: HTTP endpoint testing
- **Git**: For repository metadata extraction
- **GitHub Actions**: For automated releases and testing

## Development Guidelines

### Code Style
- **ES6 Modules**: Import/export syntax
- **Modern JavaScript**: Async/await, const/let
- **Functional Approach**: Pure functions where possible
- **Error Handling**: Comprehensive try/catch and validation

### Security Practices
- **Secure by Design**: Cryptographic randomness, timing attack prevention
- **Input Validation**: All user inputs validated
- **Error Privacy**: No sensitive data in error responses
- **Least Privilege**: Module permissions scoped appropriately

### Testing Strategy
- **Unit Testing**: Jest tests for both module and bridge server components
- **Integration Testing**: Socket.io communication between components  
- **Contract Testing**: Verify socket message formats and API responses
- **End-to-End Testing**: Full request flow from HTTP to FoundryVTT data
- **Security Testing**: Authentication bypass attempts and timing attacks
- **Load Testing**: Multiple concurrent API requests through bridge server

## Troubleshooting

### Common Issues

**Bridge Server Issues:**
- **Connection Refused (Port 3030)**: Verify bridge server is running (`npm start` in bridge-server/)
- **Socket Connection Failed**: Check FoundryVTT is running and module is active
- **401 Unauthorized**: Verify API key matches between FoundryVTT module and bridge server

**FoundryVTT Module Issues:**
- **Module Not Loading**: Check FoundryVTT compatibility (v13-v14) and enable module
- **Socket Server Not Starting**: Enable "REST API" in module settings
- **Empty Results**: Validate search parameters and world data existence

**Development Issues:**
- **Build Failures**: Ensure Node.js >=16 and git repository setup
- **Test Failures**: Install dependencies in both root and bridge-server directories

### Debug Mode

**FoundryVTT Module:**
Enable "Log API Requests" in module settings to see all incoming socket messages in FoundryVTT console.

**Bridge Server:**
```bash
LOG_LEVEL=debug npm start  # Enable verbose logging
```

## Future Development

### Potential Enhancements
- WebSocket support for real-time updates
- Additional endpoints (macros, journals, chat)
- Rate limiting and request throttling
- OpenAPI/Swagger documentation generation
- Multi-language localization expansion

### Architecture Benefits
- **Modular Design**: Easy to add new endpoints in both components independently
- **Standard Protocols**: HTTP + WebSocket enables integration with any REST client
- **Scalable Communication**: Socket.io handles connection management, reconnection, and retries
- **Separation of Concerns**: Browser security context separate from HTTP server responsibilities
- **Flexible Authentication**: Multiple authentication methods (header, bearer token)
- **Consistent Responses**: Unified error handling and data formatting across all endpoints
- **Production Ready**: Comprehensive logging, error handling, and configuration management
- **Browser Limitations Solved**: Two-component design overcomes JavaScript security restrictions
- **Real-time Capable**: Socket.io foundation allows future real-time features
- **Testable Architecture**: Clear component boundaries enable thorough testing strategies