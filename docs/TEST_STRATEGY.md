# Test-Driven Development Strategy

## Overview

This document outlines the comprehensive TDD strategy implemented for the FoundryVTT Local REST API module. The testing approach follows the RED-GREEN-REFACTOR cycle and addresses the unique challenges of the two-component architecture.

## Test Infrastructure

### Bridge Server (`/bridge-server`)
- **Framework**: Jest with ES modules support
- **Coverage Target**: 80% for all metrics
- **Test Categories**:
  - Unit tests: Individual component logic
  - Integration tests: Express endpoints and middleware
  - Contract tests: Socket message format validation
  - E2E tests: Complete request flows

### FoundryVTT Module (`/scripts`)
- **Framework**: Jest with JSDOM environment
- **Coverage Target**: 80% for all metrics
- **Mock Strategy**: Comprehensive FoundryVTT game object mocks
- **Test Categories**:
  - Unit tests: Auth, handlers, utilities
  - Integration tests: Socket message handling
  - Contract tests: Shared with bridge server

## Running Tests

### Quick Start
```bash
# Install dependencies
npm install
cd bridge-server && npm install

# Run all tests
npm run test:all

# Run specific test suites
npm test                    # Module tests
cd bridge-server && npm test  # Bridge tests

# Watch mode for development
npm run test:watch

# Coverage reports
npm run test:coverage
```

### Bridge Server Testing
```bash
cd bridge-server

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Contract tests
npm run test:contracts

# Full test suite with coverage
npm run test:coverage
```

## TDD Workflow

### 1. RED Phase - Write Failing Test
```javascript
// Example: Testing new endpoint
test('should return filtered actors by type', async () => {
  const response = await request(app)
    .get('/api/actors?type=npc')
    .set('x-api-key', validApiKey);
    
  expect(response.status).toBe(200);
  expect(response.body.data).toBeArray();
  expect(response.body.data[0].type).toBe('npc');
});
```

### 2. GREEN Phase - Minimal Implementation
```javascript
// Implement just enough to pass
router.get('/actors', async (req, res) => {
  const { type } = req.query;
  const actors = await getActors({ type });
  res.json({ success: true, data: actors });
});
```

### 3. REFACTOR Phase - Improve Design
```javascript
// Refactor for clarity and maintainability
router.get('/actors', validateQuery, async (req, res) => {
  try {
    const actors = await actorService.search(req.query);
    res.json(formatResponse(actors));
  } catch (error) {
    handleError(res, error);
  }
});
```

## Test Patterns

### Unit Test Pattern
```javascript
describe('ComponentName', () => {
  let component;
  
  beforeEach(() => {
    // Setup
    component = new Component();
  });
  
  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });
  
  describe('methodName', () => {
    test('should handle normal case', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = component.method(input);
      
      // Assert
      expect(result).toBe('expected');
    });
    
    test('should handle edge case', () => {
      // Test edge cases
    });
    
    test('should handle error case', () => {
      // Test error scenarios
    });
  });
});
```

### Integration Test Pattern
```javascript
describe('API Endpoint', () => {
  let server;
  
  beforeAll(async () => {
    server = await createTestServer();
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  test('should integrate with socket client', async () => {
    // Test actual integration
  });
});
```

### Contract Test Pattern
```javascript
describe('Message Contract', () => {
  test('request format should match specification', () => {
    const message = createRequestMessage();
    expect(message).toMatchSchema(requestSchema);
  });
  
  test('response format should match specification', () => {
    const response = createResponseMessage();
    expect(response).toMatchSchema(responseSchema);
  });
});
```

## Mock Strategies

### Minimal Mocking Principle
- Only mock external dependencies
- Use real implementations when possible
- Prefer test doubles over complex mocks

### FoundryVTT Mocks
```javascript
import { createMockGame, MockActor } from '../mocks/foundry-mocks.js';

const game = createMockGame({
  actors: [
    new MockActor({ name: 'Test Actor', type: 'character' })
  ]
});
```

### Socket.io Mocks
```javascript
jest.mock('socket.io-client');

const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  connected: true
};

io.mockReturnValue(mockSocket);
```

## Coverage Goals

### Metrics
- **Branches**: 80% minimum
- **Functions**: 80% minimum
- **Lines**: 80% minimum
- **Statements**: 80% minimum

### Critical Path Coverage
These areas require 100% coverage:
- Authentication logic
- API key validation
- Error handling
- Socket message routing
- Security functions (timing attack prevention)

## CI/CD Integration

### GitHub Actions Workflow
- Triggered on push and pull requests
- Matrix testing across Node.js versions (16, 18, 20)
- Parallel execution of module and bridge tests
- E2E tests with containerized FoundryVTT
- Coverage reports uploaded to Codecov

### Test Stages
1. **Unit Tests**: Fast, isolated component tests
2. **Integration Tests**: Component interaction tests
3. **Contract Tests**: Interface validation
4. **E2E Tests**: Full system validation
5. **Security Scan**: Dependency vulnerability checks

## Best Practices

### Test Naming
- Use descriptive test names
- Follow "should [expected behavior] when [condition]" pattern
- Group related tests in describe blocks

### Test Data
- Use factories for test data creation
- Avoid hardcoded values
- Generate unique IDs for isolation

### Async Testing
```javascript
// Prefer async/await
test('should handle async operation', async () => {
  const result = await asyncOperation();
  expect(result).toBeDefined();
});

// Avoid callbacks and done()
```

### Error Testing
```javascript
// Test both error type and message
await expect(operation()).rejects.toThrow(ValidationError);
await expect(operation()).rejects.toThrow('Invalid input');
```

## Common Commands

```bash
# Run tests matching pattern
npm test -- --testNamePattern="auth"

# Run tests in specific file
npm test -- auth.test.js

# Update snapshots
npm test -- -u

# Debug tests
node --inspect-brk node_modules/.bin/jest --runInBand

# Run single test file
npm test -- --testPathPattern=auth
```

## Troubleshooting

### Common Issues

1. **ESM Import Errors**
   - Solution: Ensure NODE_OPTIONS=--experimental-vm-modules is set

2. **Mock Not Working**
   - Solution: Check jest.mock() is before imports

3. **Timeout Errors**
   - Solution: Increase timeout in jest.config.js

4. **Coverage Not Accurate**
   - Solution: Check collectCoverageFrom patterns

## Future Improvements

- [ ] Add mutation testing
- [ ] Implement visual regression testing
- [ ] Add performance benchmarks
- [ ] Create test data generators
- [ ] Add property-based testing
- [ ] Implement snapshot testing for responses

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [TDD Guide](https://martinfowler.com/bliki/TestDrivenDevelopment.html)