# Development

Building, testing and supporting the project.

## Development

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

## Testing

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

See [TEST_COVERAGE_REPORT.md](../TEST_COVERAGE_REPORT.md) for detailed coverage metrics.

## Support

- **Issues**: [GitHub Issues](https://github.com/laurigates/foundryvtt-local-rest-api/issues)
- **Documentation**: Complete guides in documentation files
- **Community**: FoundryVTT Discord #module-development

---

**Built with privacy and security in mind. Your game data stays where it belongs - with you.** 🔒
