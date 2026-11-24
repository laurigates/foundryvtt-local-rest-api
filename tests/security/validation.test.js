/**
 * Input Validation Security Tests for Foundry Local REST API
 * Tests input sanitization, injection prevention, and data validation
 */

import { SocketMessageHandler } from '../../scripts/socket-handler.js';
import { ValidationSchemas } from '../../scripts/validation/schemas.js';

describe('Input Validation Security', () => {
  let socketHandler;
  let mockGame;
  let validationSchemas;
  let consoleErrorSpy;

  beforeEach(() => {
    // Setup mocks
    mockGame = {
      user: { id: 'user123', role: 4, isGM: true },
      actors: new Map(),
      items: new Map(),
      settings: {
        get: jest.fn().mockReturnValue('test-api-key')
      }
    };

    global.game = mockGame;
    // DiagnosticsAPI (built by SocketMessageHandler) replaces console.error
    // with a capturing wrapper that forwards to the previous function, so
    // keep a handle on the spy rather than reading console.error afterwards.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Initialize handlers
    socketHandler = new SocketMessageHandler();
    socketHandler.setApiKey('test-api-key');
    validationSchemas = new ValidationSchemas();
  });

  describe('SQL Injection Prevention', () => {
    test('should sanitize SQL-like patterns in search queries', async () => {
      const injectionAttempts = [
        "'; DROP TABLE actors; --",
        "1' OR '1'='1",
        "admin'--",
        "' OR 1=1--",
        "'; DELETE FROM items WHERE '1'='1"
      ];

      for (const injection of injectionAttempts) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { query: injection } }
        };

        const response = await socketHandler.handleMessage(request);

        // Should not cause errors, should sanitize
        // Search payloads are the route's {success, data} object inside the
        // socket envelope, so the result list is response.data.data.
        expect(response.success).toBe(true);
        expect(response.data.data).toEqual([]); // No results for malicious input
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('XSS Prevention', () => {
    test('should sanitize HTML/JavaScript in input', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<svg onload=alert("XSS")>',
        '"><script>alert("XSS")</script>'
      ];

      for (const xss of xssAttempts) {
        const request = {
          type: 'dice.roll',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          body: {
            formula: '1d20',
            reason: xss // XSS in reason field
          }
        };

        const response = await socketHandler.handleMessage(request);

        if (response.success) {
          // Check that HTML is escaped in response
          expect(response.data.reason).not.toContain('<script>');
          expect(response.data.reason).not.toContain('javascript:');
          expect(response.data.reason).not.toContain('onerror=');
        }
      }
    });
  });

  describe('Command Injection Prevention', () => {
    test('should prevent command injection in dice formulas', async () => {
      const commandInjections = [
        '1d20; process.exit()',
        '1d20 && rm -rf /',
        '1d20 | cat /etc/passwd',
        'eval("malicious code")',
        'require("fs").readFileSync("/etc/passwd")'
      ];

      for (const injection of commandInjections) {
        const request = {
          type: 'dice.roll',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          body: { formula: injection }
        };

        const response = await socketHandler.handleMessage(request);

        // Should reject invalid formulas
        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation Error');
        expect(response.message).toMatch(/invalid/i);
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should prevent path traversal in IDs', async () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'actor123/../../admin',
        'actor123%2F..%2F..%2Fadmin'
      ];

      for (const traversal of pathTraversalAttempts) {
        const request = {
          type: 'actors.get',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { id: traversal }
        };

        const response = await socketHandler.handleMessage(request);

        // Rejected by ID validation before any lookup
        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation Error');
        expect(response.message).toMatch(/invalid|path traversal/i);
      }
    });
  });

  describe('Input Length Validation', () => {
    test('should enforce maximum query length', async () => {
      const longString = 'a'.repeat(1000);

      const request = {
        type: 'actors.search',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { query: { query: longString } }
      };

      const response = await socketHandler.handleMessage(request);

      // Should reject or truncate overly long input
      expect(response.success).toBe(false);
      expect(response.error).toBe('Validation Error');
      expect(response.message).toContain('too long');
    });

    test('should limit number of results', async () => {
      const request = {
        type: 'actors.search',
        requestId: 'req123',
        auth: { apiKey: 'test-api-key' },
        params: { query: { limit: 99999 } }
      };

      const response = await socketHandler.handleMessage(request);

      // Limits above the maximum (100) are rejected rather than capped
      expect(response.success).toBe(false);
      expect(response.error).toBe('Validation Error');
      expect(response.message).toContain('at most 100');
    });
  });

  describe('Type Validation', () => {
    test('should validate parameter types', async () => {
      const invalidRequests = [
        {
          type: 'actors.search',
          params: { query: { limit: 'not-a-number' } }
        },
        {
          type: 'actors.search',
          params: { query: { limit: -5 } }
        },
        {
          type: 'dice.roll',
          body: { formula: 123 } // Should be string
        },
        {
          type: 'actors.get',
          params: { id: null }
        }
      ];

      for (const invalidRequest of invalidRequests) {
        const request = {
          ...invalidRequest,
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' }
        };

        const response = await socketHandler.handleMessage(request);

        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation Error');
      }
    });
  });

  describe('JSON Injection Prevention', () => {
    test('should handle malformed JSON safely', async () => {
      const malformedInputs = [
        '{"__proto__": {"isAdmin": true}}',
        '{"constructor": {"prototype": {"isAdmin": true}}}',
        undefined,
        null,
        NaN,
        Infinity
      ];

      for (const input of malformedInputs) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: input
        };

        // Should handle gracefully without crashes
        try {
          const response = await socketHandler.handleMessage(request);
          expect(response.success).toBeDefined();
        } catch (error) {
          // Should not throw unhandled errors
          expect(error).toBeUndefined();
        }
      }
    });
  });

  describe('NoSQL Injection Prevention', () => {
    test('should prevent NoSQL injection patterns', async () => {
      const noSqlInjections = [
        { $gt: '' },
        { $ne: null },
        { $where: 'this.password == "admin"' },
        { $or: [{ a: 'a' }, { a: 'a' }] }
      ];

      for (const injection of noSqlInjections) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: injection }
        };

        const response = await socketHandler.handleMessage(request);

        // Search validation keeps only query/type/limit, so operator keys
        // never reach the route: the search runs unfiltered and echoes none
        expect(response.success).toBe(true);
        expect(JSON.stringify(response.data.query)).not.toMatch(/\$/);
      }
    });
  });

  describe('Regular Expression DoS Prevention', () => {
    test('should prevent ReDoS attacks', async () => {
      const redosPatterns = ['(a+)+$', '(a|a)*', '(.*a){x}', '((a+)+)+b'];

      for (const pattern of redosPatterns) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { pattern } }
        };

        // Should timeout or reject dangerous patterns
        const startTime = Date.now();
        const response = await socketHandler.handleMessage(request);
        const duration = Date.now() - startTime;

        // Should not take excessive time
        expect(duration).toBeLessThan(1000);

        if (response.success) {
          expect(response.data.data).toEqual([]);
        }
      }
    });
  });

  describe('Numeric Range Validation', () => {
    test('should validate numeric ranges', async () => {
      const numericTests = [
        { limit: -1, shouldFail: true },
        { limit: 0, shouldFail: true },
        { limit: 1, shouldFail: false },
        { limit: 100, shouldFail: false },
        { limit: 1001, shouldFail: true },
        { limit: Infinity, shouldFail: true }
      ];

      for (const test of numericTests) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { limit: test.limit } }
        };

        const response = await socketHandler.handleMessage(request);

        if (test.shouldFail) {
          expect(response.success).toBe(false);
        } else {
          expect(response.success).toBe(true);
        }
      }
    });
  });
});
