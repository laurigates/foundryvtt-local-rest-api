# CLAUDE.md

A **purely local** REST API module for FoundryVTT that provides HTTP endpoints for external integrations without relying on third-party relay services. This module enables secure, local-only access to actors, items, scenes, dice rolling, and world data.

## Project Overview

**Type**: FoundryVTT Module (JavaScript ES6)  
**Purpose**: Local REST API server for FoundryVTT game data  
**License**: MIT  
**Node Version**: >=16.0.0  
**FoundryVTT Compatibility**: v11-v13  

## Architecture

### Module Structure
```
foundry-local-rest-api/
├── module.json              # Generated from template
├── module.json.template     # Source template with placeholders
├── package.json             # Node.js project metadata
├── scripts/
│   ├── rest-api.js          # Main module entry point
│   ├── auth.js              # API key authentication system
│   ├── build.js             # Template processing & build logic
│   └── routes/              # API endpoint handlers
│       ├── actors.js        # Actor CRUD operations
│       ├── items.js         # Item search & retrieval
│       ├── dice.js          # Dice rolling API
│       ├── scenes.js        # Scene data access
│       ├── world.js         # World information
│       └── diagnostics.js   # Status & health checks
├── lang/
│   └── en.json              # Localization strings
└── templates/
    └── api-config.hbs       # UI configuration template
```

### Key Components

**Main Module** (`scripts/rest-api.js`):
- ES6 module initialization
- Hook into FoundryVTT lifecycle
- Settings registration and management
- HTTP server management

**Authentication** (`scripts/auth.js`):
- Cryptographically secure API key generation
- Constant-time key validation (timing attack prevention)
- Header-based and Bearer token authentication

**API Routes** (`scripts/routes/*`):
- RESTful endpoint handlers
- FoundryVTT data integration
- Error handling and validation
- JSON response formatting

## Development Workflow

### Essential Commands
```bash
npm run build                    # Generate module.json from template
npm test                         # No tests currently configured
zip -r foundry-local-rest-api.zip . -x "*.git*" "node_modules/*" "*.DS_Store*" "module.json.template"  # Package for distribution
```

### Build Process
1. **Template Processing**: `scripts/build.js` processes `module.json.template`
   - Replaces `{{MODULE_VERSION}}` with package.json version
   - Replaces `{{GITHUB_REPOSITORY}}` with git remote info
   - Replaces `{{AUTHOR_NAME}}` and `{{AUTHOR_EMAIL}}` with git config
2. **Module Generation**: Creates final `module.json` with resolved values
3. **Packaging**: GitHub Actions creates zip and uploads to releases

### Release Pipeline
- **Trigger**: Git tags matching `v*.*.*` pattern
- **Platform**: Ubuntu latest with Node.js 18
- **Steps**:
  1. Checkout code
  2. Install dependencies (`npm ci`)
  3. Generate module.json (`npm run build`)
  4. Create distribution zip
  5. Upload to GitHub releases

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
Replace third-party REST module dependency by updating `.env`:
```env
FOUNDRY_URL=http://localhost:30000
FOUNDRY_API_KEY=your_local_api_key_here
USE_REST_MODULE=false  # Use local module instead
```

### JavaScript/Node.js
```javascript
const response = await fetch('http://localhost:30000/api/actors', {
  headers: { 'x-api-key': 'YOUR_API_KEY' }
});
const actors = await response.json();
```

### Python
```python
import requests
response = requests.get(
  'http://localhost:30000/api/actors',
  headers={'x-api-key': 'YOUR_API_KEY'}
)
actors = response.json()
```

## Files & Directories

### Key Files
- `module.json.template` - Source manifest with build-time placeholders
- `scripts/rest-api.js` - Module entry point and HTTP server
- `scripts/auth.js` - Security and authentication logic
- `scripts/build.js` - Template processing and dynamic value injection
- `lang/en.json` - UI localization strings
- `.github/workflows/build.yml` - Release automation

### Generated/Ignored Files
- `module.json` - Generated by build process, not committed
- `*.zip` - Distribution packages
- `node_modules/` - Dependencies

## Dependencies & Compatibility

### Runtime Dependencies
- **FoundryVTT**: v11-v13 (verified through v13)
- **Browser**: Modern ES6+ support
- **No External Libraries**: Pure JavaScript implementation

### Development Dependencies  
- **Node.js**: >=16.0.0 for build process
- **Git**: For repository metadata extraction
- **GitHub Actions**: For automated releases

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
- **Manual Testing**: FoundryVTT module installation and API testing
- **Integration Testing**: Real-world usage with MCP servers
- **Security Testing**: Authentication bypass attempts
- **Load Testing**: Multiple concurrent API requests

## Troubleshooting

### Common Issues
- **401 Unauthorized**: Check API key format and module enablement
- **Connection Refused**: Verify FoundryVTT is running and module is active
- **Empty Results**: Validate search parameters and world data existence
- **Build Failures**: Ensure Node.js >=16 and git repository setup

### Debug Mode
Enable "Log API Requests" in module settings to see all incoming requests in FoundryVTT console for debugging authentication and request issues.

## Future Development

### Potential Enhancements
- WebSocket support for real-time updates
- Additional endpoints (macros, journals, chat)
- Rate limiting and request throttling
- OpenAPI/Swagger documentation generation
- Multi-language localization expansion

### Architecture Considerations
- Modular route system allows easy endpoint addition
- Authentication system supports multiple token types
- Response format consistency across all endpoints
- Hook-based integration with FoundryVTT lifecycle