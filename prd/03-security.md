# Security Requirements

## Authentication

### API Key Generation
- **Algorithm**: crypto.randomBytes(32)
- **Format**: 64-character hex string
- **Uniqueness**: Cryptographically guaranteed
- **Storage**: FoundryVTT world settings (encrypted by browser)

### Key Validation
- **Method**: Constant-time comparison
- **Timing Attack Prevention**: Fixed-time algorithm
- **Rate Limiting**: Not required (local only)
- **Brute Force**: Infeasible (2^256 keyspace)

## Input Validation

### Request Validation
- **Parameters**: Type checking and sanitization
- **Limits**: Max 100 results per query
- **IDs**: Validate FoundryVTT ID format
- **Queries**: Escape special characters

### Response Sanitization
- **Errors**: No stack traces in production
- **Paths**: No file system paths exposed
- **Keys**: Never included in responses
- **Data**: Only game data returned

## Network Security

### Local-Only Design
- **No External Calls**: Zero outbound connections
- **Localhost Binding**: Default to 127.0.0.1
- **Private Network**: Support 192.168.x.x, 10.x.x.x
- **No Cloud**: Explicitly documented as local-only

### CORS Configuration
- **Origins**: Configurable whitelist
- **Credentials**: Not supported (API key only)
- **Methods**: GET, POST only
- **Headers**: Minimal set allowed

## Privacy Protection

### Data Handling
- **No Logging**: Sensitive data never logged
- **No Analytics**: Zero tracking or telemetry
- **No Storage**: Bridge stores nothing
- **No Transmission**: Data never leaves local network

### Compliance
- **GDPR**: N/A (no data collection)
- **CCPA**: N/A (no data sale)
- **Privacy by Design**: Core architecture principle