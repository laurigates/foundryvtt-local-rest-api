// Global test setup
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.API_PORT = '3031'; // Use different port for tests
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

// Only suppress console in non-verbose mode
const isVerbose = process.env.VERBOSE_TESTS === 'true';

global.console = {
  ...console,
  log: isVerbose ? originalConsole.log : () => {},
  info: isVerbose ? originalConsole.info : () => {},
  warn: isVerbose ? originalConsole.warn : () => {},
  error: isVerbose ? originalConsole.error : () => {},
  debug: isVerbose ? originalConsole.debug : () => {}
};

// Global test utilities
global.testUtils = {
  generateApiKey: () => {
    return 'test-api-key-' + Math.random().toString(36).substring(7);
  },

  mockSocketResponse: (requestId, data, success = true) => {
    return {
      requestId,
      success,
      ...(success ? { data } : { error: 'Error', message: data })
    };
  },

  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

// Note: afterAll hook will be in individual test files
