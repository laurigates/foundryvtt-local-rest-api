# Installation Guide

This guide provides step-by-step instructions for setting up the Foundry Local REST API solution, which consists of two components working together.

## Overview

The Foundry Local REST API uses a two-component architecture:

1. **FoundryVTT Module**: Runs inside FoundryVTT's browser context, manages authentication and data access
2. **Bridge Server**: Node.js HTTP server that provides REST endpoints and communicates with the module

```
External App → Bridge Server → Socket.io → FoundryVTT Module → Game Data
   (HTTP)        (Node.js)     (WebSocket)   (Browser JS)
```

## Prerequisites

- **FoundryVTT v11+** running on your system
- **Node.js 22.12+** installed for the bridge server
- Basic familiarity with command line operations

## Step-by-Step Installation

### 1. Install FoundryVTT Module

1. **Download the Module**:
   - In FoundryVTT, go to **Setup** → **Add-on Modules** → **Install Module**
   - Paste this manifest URL:
     ```
     https://github.com/yourusername/foundryvtt-local-rest-api/releases/latest/download/module.json
     ```
   - Click **Install**

2. **Enable the Module**:
   - Go to your world and click **Settings** → **Manage Modules**
   - Find **"Foundry Local REST API"** and check the box to enable it
   - Click **Update Modules** to activate

3. **Configure Module Settings**:
   - Go to **Settings** → **Configure Settings** → **Module Settings**
   - Find **"Foundry Local REST API"** section
   - Check **"Enable REST API"** to activate the module
   - Copy the **API Key** that's generated (you'll need this for the bridge server)
   - Optionally enable **"Log API Requests"** for debugging

### 2. Set Up Bridge Server

1. **Download Bridge Server**:
   - Download the complete release package:
     ```bash
     wget https://github.com/yourusername/foundryvtt-local-rest-api/releases/latest/download/foundryvtt-local-rest-api.zip
     unzip foundryvtt-local-rest-api.zip
     cd foundryvtt-local-rest-api/bridge-server
     ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Create Configuration**:
   ```bash
   cp .env.example .env
   ```

4. **Edit Configuration**:
   Edit the `.env` file with your settings:
   ```env
   # FoundryVTT connection
   FOUNDRY_URL=http://localhost:30000
   API_KEY=your_foundry_api_key_here

   # Bridge server settings
   API_PORT=3030
   REQUEST_TIMEOUT=5000

   # Optional settings
   CORS_ORIGIN=*
   LOG_LEVEL=info
   ```

   **Important**: Replace `your_foundry_api_key_here` with the API key from step 1.3.

5. **Start Bridge Server**:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

### 3. Verify Installation

1. **Test Bridge Server Status**:
   ```bash
   curl http://localhost:3030/api/status
   ```

   Expected response:
   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "bridge": "foundry-rest-bridge",
       "version": "1.0.0",
       "connected": true,
       "foundry": {
         "url": "http://localhost:30000",
         "connected": true
       }
     }
   }
   ```

2. **Test Authenticated Endpoint**:
   ```bash
   curl -H "x-api-key: YOUR_API_KEY" http://localhost:3030/api/actors
   ```

   Should return JSON with actor data from your world.

3. **Check Components Status**:
   - FoundryVTT console should show: `"Foundry Local REST API | Socket server started"`
   - Bridge server console should show: `"Connected to FoundryVTT"`

## Configuration Details

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

### Security Configuration

- **API Key**: Store securely, never commit to version control
- **CORS**: Restrict origins in production environments
- **Network**: Run on internal network or behind reverse proxy
- **Logging**: Enable debug mode only during troubleshooting

## Production Deployment

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
cd bridge-server
pm2 start server.js --name foundry-bridge

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker

Create `bridge-server/Dockerfile`:
```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3030
CMD ["npm", "start"]
```

Build and run:
```bash
cd bridge-server
docker build -t foundry-bridge .
docker run -d -p 3030:3030 --env-file .env foundry-bridge
```

### Environment Configuration

Production environment:
```env
NODE_ENV=production
API_PORT=3030
FOUNDRY_URL=http://your-foundry-server:30000
API_KEY=your-production-api-key
LOG_LEVEL=warn
CORS_ORIGIN=https://your-app-domain.com
```

## Troubleshooting

### Common Issues

1. **Bridge Server Won't Start**:
   - Check Node.js version: `node --version` (should be 22.12+)
   - Verify port 3030 is available: `lsof -i :3030`
   - Check for missing dependencies: `npm install`

2. **Cannot Connect to FoundryVTT**:
   - Verify `FOUNDRY_URL` in `.env` is correct
   - Check FoundryVTT is running and accessible
   - Ensure WebSocket is enabled in FoundryVTT
   - Check firewall settings for ports

3. **Authentication Errors**:
   - Verify API key matches between module and bridge server
   - Check API key format (no extra spaces or characters)
   - Ensure FoundryVTT module is enabled and active

4. **Socket Connection Issues**:
   - Check FoundryVTT module logs for errors
   - Verify Socket.io namespace configuration
   - Try increasing reconnection delay in bridge server

### Debug Mode

Enable detailed logging:

**Bridge Server**:
```bash
LOG_LEVEL=debug npm start
```

**FoundryVTT Module**:
Enable "Log API Requests" in module settings.

### Health Checks

Monitor system health:
```bash
# Bridge server health
curl http://localhost:3030/api/diagnostics/health

# Component connectivity
curl http://localhost:3030/api/status
```

## Integration Examples

### FoundryVTT MCP Server

Update your MCP server configuration:
```env
FOUNDRY_URL=http://localhost:3030
FOUNDRY_API_KEY=your_local_api_key_here
USE_REST_MODULE=false
```

### Custom Applications

```javascript
// JavaScript example
const response = await fetch('http://localhost:3030/api/actors', {
  headers: { 'x-api-key': 'your-api-key' }
});
const actors = await response.json();
```

```python
# Python example
import requests

response = requests.get(
  'http://localhost:3030/api/actors',
  headers={'x-api-key': 'your-api-key'}
)
actors = response.json()
```

## Maintenance

### Updating

1. **Update FoundryVTT Module**:
   - Download new module version
   - Replace module files in FoundryVTT
   - Restart FoundryVTT

2. **Update Bridge Server**:
   - Stop bridge server
   - Download new bridge server version
   - Run `npm install` for new dependencies
   - Start bridge server

### Monitoring

- Check bridge server logs regularly
- Monitor FoundryVTT module status
- Verify API endpoint response times
- Watch for authentication failures

### Backup

- Back up FoundryVTT world data regularly
- Store API keys securely
- Document custom configuration changes

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Enable debug logging and check logs
3. Verify all configuration settings
4. Test each component independently
5. Open an issue on GitHub with detailed logs and configuration

For additional help, visit the project repository or FoundryVTT community forums.
