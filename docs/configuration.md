# Configuration

Module settings and bridge-server environment variables.

### Module Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable REST API** | Turn the API on/off | `false` |
| **API Key** | Authentication key (auto-generated) | _(generated)_ |
| **Log API Requests** | Log all requests for debugging | `false` |

### Bridge Server Environment Variables

Read in `bridge-server/server.js`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_KEY` | _(none)_ | API key copied from the module settings |
| `API_PORT` | `3030` | HTTP port |
| `FOUNDRY_URL` | `http://localhost:30000` | FoundryVTT URL the bridge connects to |
| `FOUNDRY_NAMESPACE` | `module.foundryvtt-local-rest-api` | Socket.io namespace |
| `FOUNDRY_USERNAME` | _(none)_ | Foundry user the bridge authenticates as |
| `REQUEST_TIMEOUT` | `5000` | Request timeout in milliseconds |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `LOG_LEVEL` | `info` | Log verbosity |

### Environment Integration

The API is designed to work seamlessly with:

- **FoundryVTT MCP Server** - Replace third-party REST module dependency
- **Custom Scripts** - Direct API access for automation
- **External Tools** - Campaign management and integration tools
- **Mobile Apps** - Build companion apps with live game data
