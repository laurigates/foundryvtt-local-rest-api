# Quick Setup Guide for FoundryVTT Local REST API

## FoundryVTT Module Setup (REQUIRED)

### 1. Enable the Module
1. In FoundryVTT, go to **Game Settings** → **Manage Modules**
2. Find **"FoundryVTT Local REST API"** and check the box to enable it
3. Click **Save Module Settings**

### 2. Enable the API
1. Go to **Game Settings** → **Configure Settings** 
2. Find **"FoundryVTT Local REST API"** section
3. Check **"Enable REST API"** 
4. Click **Save Changes**

### 3. Verify API Key
1. In the same settings section, click **"API Configuration"**
2. Your API key should be: `YOUR_API_KEY`
3. If different, copy the key and update `.env` file

### 4. Check Browser Console
Press F12 in FoundryVTT and look for:
- "Foundry Local REST API | Socket handlers enabled"
- No error messages about the module

## Bridge Server Setup

The bridge server is already configured with your API key.

### Test Connection
```bash
# In bridge-server directory
node test-connection.js
```

You should see:
- ✅ Connected to FoundryVTT Socket.io server
- ✅ Received response from FoundryVTT module

### Start Bridge Server
```bash
npm start
```

### Test API
```bash
# Get actors
curl -H "x-api-key: YOUR_API_KEY" \
  http://localhost:3030/api/actors

# Get world info
curl -H "x-api-key: YOUR_API_KEY" \
  http://localhost:3030/api/world
```

## Troubleshooting

### Module Not Responding
If you get timeout errors:

1. **Check Module is Enabled**: Must see checkmark in Module Management
2. **Check API is Enabled**: Setting must be checked
3. **Refresh FoundryVTT**: F5 to reload after enabling
4. **Check Console**: F12 for any error messages

### Still Not Working?
1. Open FoundryVTT browser console (F12)
2. Run this test:
```javascript
// Test if module is loaded
console.log(window.foundryLocalRestAPI);

// Test socket handler
game.socket.emit('module.foundryvtt-local-rest-api', {
  type: 'status',
  requestId: 'test123',
  auth: { apiKey: 'YOUR_API_KEY' }
});
```

You should see a response in the console.