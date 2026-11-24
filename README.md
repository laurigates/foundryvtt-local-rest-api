# Foundry Local REST API

A **purely local** REST API solution for FoundryVTT that provides HTTP endpoints for external integrations without relying on third-party relay services. This two-component system enables secure, local-only access to actors, items, scenes, dice rolling, and world data.

## Architecture Overview

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

## 🔒 Privacy & Security

- **100% Local** - No external dependencies or third-party services
- **No Data Leaves Your Network** - All API calls stay within your local environment
- **Secure API Key Authentication** - Cryptographically secure local authentication
- **Full Control** - You own and control all your game data

## ✨ Features

### Core Endpoints
- 🎲 **Dice Rolling** - `/api/dice/roll` - Roll dice with FoundryVTT's native system
- 👥 **Actor Management** - `/api/actors` - Search and retrieve character/NPC data
- 🎒 **Item Catalog** - `/api/items` - Search equipment, spells, and consumables
- 🗺️ **Scene Information** - `/api/scenes` - Access scene data and current scene
- 🌍 **World Data** - `/api/world` - Get world info, statistics, and system details

### Advanced Features
- **Real-time Integration** - Hooks into FoundryVTT's live game state
- **Comprehensive Data** - Full access to all FoundryVTT entities
- **Flexible Search** - Query by name, type, properties, and more
- **Combat Awareness** - Access current combat state and initiative
- **Module Integration** - Works alongside existing FoundryVTT modules

## 🚀 Installation

### Prerequisites
- FoundryVTT v13 or v14 running on your system, with a Gamemaster logged in through a browser (that client answers the bridge's requests)
- Node.js 16+ installed for the bridge server

### Step 1: Install FoundryVTT Module
1. In FoundryVTT, go to **Setup** → **Add-on Modules** → **Install Module**
2. Paste this manifest URL:
   ```
   https://github.com/yourusername/foundryvtt-local-rest-api/releases/latest/download/module.json
   ```
3. Click **Install**
4. Enable the module in your world
5. Go to **Settings** → **Configure Settings** → **Module Settings**
6. Find **"Foundry Local REST API"**
7. Check **"Enable REST API"**
8. Copy the generated **API Key** (you'll need this for the bridge server)

### Step 2: Set Up Bridge Server
1. Download and extract the bridge server:
   ```bash
   wget https://github.com/yourusername/foundryvtt-local-rest-api/releases/latest/download/bridge-server.zip
   unzip bridge-server.zip
   cd bridge-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your settings:
   ```env
   FOUNDRY_URL=http://localhost:30000
   API_KEY=your_foundry_api_key_here
   API_PORT=3030
   REQUEST_TIMEOUT=5000
   ```

5. Start the bridge server:
   ```bash
   npm start
   ```

### Step 3: Test Connection
The API will be available at: `http://localhost:3030/api/`

Test with:
```bash
# Test bridge server status (no auth required)
curl http://localhost:3030/api/status

# Test authenticated endpoint
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3030/api/actors
```

## 📖 API Documentation

### Authentication

All endpoints (except `/api/status`) require authentication via API key:

```bash
# Header method (recommended)
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3030/api/actors

# Bearer token method
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3030/api/actors
```

### Endpoints

#### 🎲 Dice Rolling

**POST** `/api/dice/roll`
```json
{
  "formula": "1d20+5",
  "reason": "Attack roll",
  "advantage": false,
  "disadvantage": false,
  "sendToChat": false
}
```

Response:
```json
{
  "success": true,
  "data": {
    "formula": "1d20+5",
    "total": 18,
    "dice": [{"faces": 20, "results": [{"result": 13, "active": true}]}],
    "critical": {"success": false, "failure": false},
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

#### 👥 Actors

**GET** `/api/actors?query=goblin&type=npc&limit=10`

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "actor123",
      "name": "Goblin Warrior",
      "type": "npc",
      "level": 1,
      "hp": {"current": 7, "max": 7},
      "ac": 15,
      "cr": "1/4"
    }
  ]
}
```

**GET** `/api/actors/:id` - Get detailed actor information

#### 🎒 Items

**GET** `/api/items?query=sword&type=weapon&rarity=rare`

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "item456",
      "name": "Longsword +1",
      "type": "weapon",
      "rarity": "uncommon",
      "cost": {"value": 15, "denomination": "gp"},
      "damage": {"parts": [["1d8+1", "slashing"]]}
    }
  ]
}
```

#### 🗺️ Scenes

**GET** `/api/scenes/current` - Get active scene
**GET** `/api/scenes/:id` - Get specific scene
**GET** `/api/scenes?query=tavern` - Search scenes

#### 🌍 World Information

**GET** `/api/world`

Response:
```json
{
  "success": true,
  "data": {
    "id": "my-world",
    "title": "My Campaign",
    "system": "dnd5e",
    "foundryVersion": "12.331",
    "statistics": {
      "actors": {"total": 45, "byType": {"character": 5, "npc": 40}},
      "scenes": {"total": 12, "active": "Tavern"}
    },
    "combat": {"active": false}
  }
}
```

### Error Handling

All endpoints return errors in a consistent format:
```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error description"
}
```

## 🔧 Configuration

### Module Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable REST API** | Turn the API on/off | `false` |
| **API Key** | Authentication key (auto-generated) | _(generated)_ |
| **Log API Requests** | Log all requests for debugging | `false` |

### Environment Integration

The API is designed to work seamlessly with:

- **FoundryVTT MCP Server** - Replace third-party REST module dependency
- **Custom Scripts** - Direct API access for automation
- **External Tools** - Campaign management and integration tools
- **Mobile Apps** - Build companion apps with live game data

## 🛠️ Development

### Project Structure
```
foundryvtt-local-rest-api/
├── module.json                 # FoundryVTT module manifest
├── scripts/
│   ├── rest-api.js             # Module initialization
│   ├── socket-handler.js       # Socket.io message handler
│   ├── auth.js                 # Authentication system
│   └── routes/                 # API endpoint handlers
│       ├── actors.js           # Actor data access
│       ├── items.js            # Item data access
│       ├── dice.js             # Dice rolling
│       ├── scenes.js           # Scene data access
│       ├── world.js            # World information
│       └── diagnostics.js      # System diagnostics
├── bridge-server/              # Node.js REST API server
│   ├── server.js               # Express HTTP server
│   ├── lib/
│   │   ├── socket-client.js    # Socket.io client
│   │   └── auth.js             # Request authentication
│   ├── routes/                 # HTTP route handlers
│   │   ├── actors.js           # Actor endpoints
│   │   ├── items.js            # Item endpoints
│   │   ├── dice.js             # Dice endpoints
│   │   ├── scenes.js           # Scene endpoints
│   │   ├── world.js            # World endpoints
│   │   └── diagnostics.js      # Diagnostic endpoints
│   └── package.json            # Node.js dependencies
└── lang/
    └── en.json                 # Localization
```

### Key Features

**Security First**:
- Constant-time API key comparison prevents timing attacks
- No sensitive data exposure in error messages
- Request logging for security monitoring

**Performance Optimized**:
- Efficient data queries using FoundryVTT's native collections
- Minimal data transformation overhead
- Real-time WebSocket communication between components

**Extensible Design**:
- Modular route handlers for easy expansion
- Consistent response format across all endpoints
- Standard HTTP server allows integration with any REST client

## 🤝 Integration Examples

### FoundryVTT MCP Server

Update your MCP server's `.env` file:
```env
FOUNDRY_URL=http://localhost:3030
FOUNDRY_API_KEY=your_local_api_key_here
USE_REST_MODULE=false  # Use local bridge server instead
```

### Custom JavaScript

```javascript
const API_KEY = 'your_api_key_here';
const BASE_URL = 'http://localhost:3030/api';

async function rollInitiative() {
  const response = await fetch(`${BASE_URL}/dice/roll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({
      formula: '1d20+2',
      reason: 'Initiative'
    })
  });

  const result = await response.json();
  console.log(`Initiative: ${result.data.total}`);
}
```

### Python Example

```python
import requests

class FoundryAPI:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.headers = {'x-api-key': api_key}

    def search_actors(self, query, actor_type=None):
        params = {'query': query}
        if actor_type:
            params['type'] = actor_type

        response = requests.get(
            f"{self.base_url}/actors",
            headers=self.headers,
            params=params
        )
        return response.json()

# Usage
api = FoundryAPI('http://localhost:3030/api', 'your_api_key')
goblins = api.search_actors('goblin', 'npc')
```

## 📊 Comparison: Local vs Third-Party

| Feature | **Local Module** | Third-Party Relay |
|---------|------------------|-------------------|
| **Privacy** | ✅ 100% Local | ❌ Data sent externally |
| **Security** | ✅ Your API keys | ❌ External service keys |
| **Reliability** | ✅ No external dependencies | ❌ Relies on external service |
| **Performance** | ✅ Direct local access | ❌ Network latency |
| **Cost** | ✅ Free forever | ❓ Potential service fees |
| **Control** | ✅ Full control | ❌ Service provider dependent |

## 🐛 Troubleshooting

### Common Issues

**API returns 401 Unauthorized**
- Check your API key is correct and matches the FoundryVTT module setting
- Ensure the FoundryVTT module is enabled
- Verify the `x-api-key` header is being sent properly
- Check that the API key in bridge server `.env` matches FoundryVTT

**Cannot connect to API**
- Verify bridge server is running on port 3030
- Check FoundryVTT is running and accessible
- Ensure bridge server can connect to FoundryVTT WebSocket
- Check firewall settings for ports 3030 and 30000

**Bridge Server Connection Issues**
- Verify `FOUNDRY_URL` in `.env` points to correct FoundryVTT instance
- Check FoundryVTT WebSocket is enabled
- Ensure no proxy interfering with WebSocket connection
- Try increasing `REQUEST_TIMEOUT` in `.env`

**Empty search results**
- Check your query parameters are correctly formatted
- Verify the data exists in your FoundryVTT world
- Check FoundryVTT module logs for any processing errors
- Try broader search terms

### Component Status Check

**Check FoundryVTT Module:**
1. Verify module is enabled in world
2. Check module settings show valid API key
3. Look for socket connection messages in browser console

**Check Bridge Server:**
1. Ensure server starts without errors
2. Test status endpoint: `curl http://localhost:3030/api/status`
3. Check server logs for connection status
4. Verify WebSocket connection to FoundryVTT

### Component Status Check

**Check FoundryVTT Module:**
1. Verify module is enabled in world
2. Check module settings show valid API key
3. Look for socket connection messages in browser console

**Check Bridge Server:**
1. Ensure server starts without errors: `npm start`
2. Test status endpoint: `curl http://localhost:3030/api/status`
3. Check server logs for connection status
4. Verify WebSocket connection to FoundryVTT

### Message Flow Debugging

```
1. Client Request    2. HTTP Validation    3. Socket Message     4. Data Processing
┌─────────────┐     ┌─────────────────┐    ┌─────────────────┐   ┌─────────────────┐
│ Your App    │────>│ Bridge Server   │───>│ FoundryVTT      │──>│ Game Data       │
│ curl/fetch  │     │ Port 3030       │    │ Module          │   │ Collections     │
└─────────────┘     └─────────────────┘    └─────────────────┘   └─────────────────┘
                           │                        │                      │
                           ▼                        ▼                      ▼
                    • Validate API key       • Re-authenticate        • Query actors,
                    • Parse request          • Route to handler         items, scenes
                    • Forward via Socket.io  • Process request         • Format response
                    • Return HTTP response   • Send back result        • Return data
```

**Debug each step:**
1. Test bridge server: `curl http://localhost:3030/api/status`
2. Test authentication: `curl -H "x-api-key: KEY" http://localhost:3030/api/actors`
3. Check FoundryVTT console for socket messages
4. Verify module is processing requests and returning data

### Debug Mode

**Enable detailed logging:**

**Bridge Server:**
```bash
LOG_LEVEL=debug npm start
```

**FoundryVTT Module:**
Enable **"Log API Requests"** in module settings to see all incoming socket messages in the FoundryVTT console.

## 🧪 Testing

The project includes comprehensive test coverage with 287+ tests across unit, integration, contract, and E2E categories.

### Running Tests

**Module Tests:**
```bash
# Run all module tests
npm test

# Run with coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch
```

**Bridge Server Tests:**
```bash
cd bridge-server

# Run all tests
npm test

# Coverage report
npm run test:coverage

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Specific test suite
npm test -- --testNamePattern="AuthManager"
```

**Run All Tests:**
```bash
# From module root directory
npm run test:all
```

### Test Coverage

- **Unit Tests**: Authentication, socket handling, message routing
- **Integration Tests**: Real socket.io communication between components
- **Contract Tests**: Message format validation and API contracts
- **E2E Tests**: Complete HTTP → Socket → Response flow
- **Security Tests**: Timing attack prevention, authentication validation

Current coverage exceeds 80% for critical files (auth, socket-client, core routes).

See [TEST_COVERAGE_REPORT.md](TEST_COVERAGE_REPORT.md) for detailed coverage metrics.

## 📚 Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Comprehensive setup instructions
- **[Architecture Documentation](docs/ARCHITECTURE.md)** - Technical implementation details
- **[Bridge Server README](bridge-server/README.md)** - Bridge server specific documentation
- **[Test Coverage Report](TEST_COVERAGE_REPORT.md)** - Comprehensive test metrics
- **[Test Strategy](TEST_STRATEGY.md)** - TDD implementation guide

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

## 🙋‍♂️ Support

- **Issues**: [GitHub Issues](https://github.com/lgates/foundryvtt-mcp/issues)
- **Documentation**: Complete guides in documentation files
- **Community**: FoundryVTT Discord #module-development

---

**Built with privacy and security in mind. Your game data stays where it belongs - with you.** 🔒
