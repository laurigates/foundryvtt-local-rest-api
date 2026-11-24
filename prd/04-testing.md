# Testing Requirements

## Test Coverage Goals
- **Overall**: >80% code coverage
- **Critical Paths**: 100% coverage (auth, socket communication)
- **Error Paths**: Comprehensive edge case testing

## Module Testing

### Unit Tests (`tests/unit/`)
- **auth.test.js**: API key generation and validation
- **socket-handler.test.js**: Message routing and responses
- **routes/*.test.js**: Individual endpoint handlers

### Integration Tests (`tests/integration/`)
- **socket-communication.test.js**: Module ↔ Bridge communication
- **end-to-end.test.js**: Full request flow

### Security Tests
- **Timing attacks**: Constant-time validation
- **Input fuzzing**: Malformed requests
- **Auth bypass**: Invalid/missing keys

## Bridge Server Testing

### Unit Tests (`bridge-server/tests/unit/`)
- **auth.test.js**: Request authentication
- **socket-client.test.js**: Socket.io client behavior
- **routes/*.test.js**: HTTP endpoint handlers

### Integration Tests (`bridge-server/tests/integration/`)
- **api.test.js**: Full HTTP request/response cycle
- **reconnection.test.js**: Socket disconnect/reconnect

### Load Tests
- **Concurrent requests**: 100 simultaneous
- **Sustained load**: 1000 requests/minute
- **Memory leaks**: Long-running stability

## Test Infrastructure

### Tools
- **Framework**: Jest
- **HTTP Testing**: Supertest
- **Mocking**: Jest mocks for FoundryVTT game object
- **Coverage**: Jest coverage reporter

### CI/CD
- **GitHub Actions**: On push and PR
- **Matrix Testing**: Node 16, 18, 20
- **Coverage Upload**: Codecov or similar

### Test Data
- **Fixtures**: Sample actors, items, scenes
- **Mocks**: FoundryVTT game API
- **Factories**: Test data generators

## Acceptance Criteria
- [ ] All tests passing in CI
- [ ] Coverage meets targets
- [ ] No security vulnerabilities
- [ ] Performance benchmarks met
- [ ] Error messages helpful