# Bridge-Server Connection Fix Summary

## Issues Identified and Fixed

### 1. Module Name Inconsistency ✅
- **Problem**: Mixed use of `foundry-local-rest-api` and `foundryvtt-local-rest-api`
- **Fix**: Standardized all references to `foundryvtt-local-rest-api`

### 2. Socket Handler Registration Conflicts ✅
- **Problem**: Duplicate socket handlers in `rest-api.js` and `socket-bridge.js`
- **Fix**: Removed socket-bridge initialization, centralized handling in `rest-api.js`

### 3. Response Format Mismatch ✅
- **Problem**: Bridge server expected `result` field but module sent `data`
- **Fix**: Module now sends both `result` and `data` for compatibility

### 4. Authentication Flow Issues ✅
- **Problem**: Bridge server tried to authenticate before connection
- **Fix**: Removed authentication attempts, now connects as anonymous client

### 5. Message Format Incompatibility ✅
- **Problem**: Bridge sent `endpoint` but module expected `type`
- **Fix**: Added mapping logic to convert endpoint format to type format

## Testing Instructions

### 1. Enable Module in FoundryVTT
1. Launch FoundryVTT and load your world
2. Go to **Game Settings** → **Manage Modules**
3. Enable **"FoundryVTT Local REST API"**
4. Go to **Game Settings** → **Module Settings**
5. Find **"FoundryVTT Local REST API"** section
6. Enable the API and copy the API key

### 2. Configure Bridge Server
```bash
cd bridge-server
cp .env.example .env
```

Edit `.env` and set:
```env
FOUNDRY_URL=http://localhost:30000
API_KEY=<paste the API key from FoundryVTT>
API_PORT=3030
LOG_LEVEL=debug
```

### 3. Test Connection
```bash
# Install dependencies
npm install

# Run connection test
node test-connection.js

# If successful, start the bridge server
npm start
```

### 4. Test API Endpoints
```bash
# Test status endpoint (no auth)
curl http://localhost:3030/api/status

# Test actors endpoint (with auth)
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3030/api/actors

# Test world info
curl -H "x-api-key: YOUR_API_KEY" http://localhost:3030/api/world
```

## Key Architecture Changes

1. **Simplified Socket Handling**: Removed duplicate handlers, using single registration point
2. **Anonymous Connection**: Bridge connects without credentials, auth via API key only
3. **Flexible Message Format**: Module accepts both `type` and `endpoint` formats
4. **WebSocket Only**: Forced WebSocket transport for better reliability

## Troubleshooting

If connection still fails:

1. **Check FoundryVTT Console** (F12 in browser):
   - Look for "Foundry Local REST API | Socket handlers enabled"
   - Check for any error messages

2. **Check Bridge Server Logs**:
   - Run with `LOG_LEVEL=debug npm start`
   - Look for connection status messages

3. **Verify API Key**:
   - Must match exactly between FoundryVTT and .env
   - No extra spaces or quotes

4. **Test Direct Socket Connection**:
   ```bash
   node test-connection.js
   ```
   This will show exactly where the connection fails

## Files Modified

- `scripts/rest-api.js` - Removed socket bridge initialization
- `scripts/socket-bridge.js` - Simplified to stub
- `scripts/socket-handler.js` - Fixed response format and message parsing
- `bridge-server/lib/socket-client.js` - Removed authentication attempts
- All files - Fixed module name consistency