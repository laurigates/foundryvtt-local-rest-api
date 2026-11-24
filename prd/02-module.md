# FoundryVTT Module Requirements

## Purpose
Browser-based module that provides Socket.io server and accesses FoundryVTT game data

## Core Requirements

### Socket.io Server
- **Port**: 30000 (fixed for predictability)
- **Namespace**: `/foundryvtt-api`
- **Transport**: WebSocket with polling fallback
- **CORS**: Allow localhost origins

### Message Handling
- **Format**: `{ type, data, apiKey, requestId }`
- **Types**: Match REST endpoint names
- **Response**: `{ success, data, error, message, requestId }`
- **Timeout**: 10 seconds per request

### Authentication
- **Generation**: Cryptographic 256-bit keys
- **Storage**: FoundryVTT world settings
- **Validation**: Constant-time comparison
- **UI**: Settings panel with regenerate button

### Data Access Handlers
Each handler in `scripts/routes/`:
- **actors.js**: Actor CRUD operations
- **items.js**: Item search and retrieval
- **scenes.js**: Scene data and current scene
- **dice.js**: Dice rolling with FoundryVTT system
- **world.js**: World information and statistics
- **diagnostics.js**: Module status and health

### FoundryVTT Integration
- **Hooks**: `init`, `ready`, `updateWorldTime`
- **Settings**: Register world-scoped settings
- **Permissions**: Require GM permission for API enable
- **UI**: Handlebars template for configuration

### Error Handling
- Catch all game.* exceptions
- Return structured error responses
- Log errors to console when debug enabled
- Never expose internal paths or keys

## Module Manifest
- **Compatibility**: v11-v13
- **Type**: ES module
- **Dependencies**: None (pure JavaScript)
- **Languages**: English (extensible)